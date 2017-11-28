const Cortex = require('./cortex.js')
const io = require('socket.io')(process.env.PORT || 3000);
console.log('server started')

function rollingAverage (columns, windowSize) {
  let avgCount = 0
  const averages = {}
  return (row) => {
    avgCount = Math.min(windowSize, avgCount + 1)

    columns.forEach((col, i) => {
      const oldAvg = averages[col] || 0
      averages[col] = oldAvg + (row[i] - oldAvg) / avgCount
    })

    return averages
  }
}

function numbers (client, windowSize, onResult) {
  return client
    .createSession({status: 'open'})
    .subscribe({streams: ['pow', 'mot', 'met']})
    .then(_subs => {
      const subs = Object.assign({}, ..._subs)
      if (!subs.pow || !subs.mot || !subs.met) throw new Error('failed to subscribe')

      // Pow data columns look like 'IED_AF3/alpha', this will make them look like 'AF3/alpha'
      const makeFriendlyChannel = (col) => col.split('_')[1]

      const bandNames = subs.pow.cols.map(makeFriendlyChannel)

      // Motion data columns look like 'IMD_GYROX', this will make them look like 'gyroX'
      const makeFriendlyCol = (col) =>
          col.replace(/^IMD_(.*?)([XYZ]?)$/, (_, name, dim) => name.toLowerCase() + dim)

      const motCols = subs.mot.cols.map(makeFriendlyCol)

      // Set up our rolling average functions
      const averageMet = rollingAverage(subs.met.cols, 1)
      const averageMot = rollingAverage(motCols, windowSize)
      const averageBands = rollingAverage(bandNames, windowSize)

      const data = {}
      for (const col of [...motCols, ...subs.met.cols, ...bandNames]) {
        data[col] = 0
      }

      const onMet = (ev) =>
        maybeUpdate('met', averageMet(ev.met))
      client.on('met', onMet)

      const onMot = (ev) =>
        maybeUpdate('mot', averageMot(ev.mot))
      client.on('mot', onMot)

      const onPow = (ev) =>
        // maybeUpdate('bands', averageBands(averageSensors(ev.pow)))
        maybeUpdate('bands', averageBands(ev.pow))
      client.on('pow', onPow)

      // wait until we get a second update for the same stream
      let hasUpdate = {}
      const maybeUpdate = (key, newdata) => {
        if (hasUpdate[key]) {
          onResult(data)
          hasUpdate = {}
        }
        hasUpdate[key] = true
        Object.assign(data, newdata)
      }

      return () =>
        client
          .unsubscribe({streams: ['pow', 'mot', 'met']})
          .updateSession({status: 'close'})
          .then(() => {
            client.removeListener('mot', onMot)
            client.removeListener('pow', onPow)
          })
    })
}

io.on('connection', function(socket){
  console.log('client connected')

  if (require.main === module) {
    process.on('unhandledRejection', (err) => { throw err })

    // Set LOG_LEVEL=2 or 3 for more detailed errors
    const verbose = process.env.LOG_LEVEL || 1
    const options = {verbose}
    const avgWindow = 10

    const client = new Cortex(options)

   // Auth token
    const auth = {
      username: 'XXXXXXXXXX',
      password: 'XXXXXXXXXX',
      client_id: 'XXXXXXXXXX',
      client_secret: 'XXXXXXXXX',
      debit: 1
    }

    client.ready
      .then(() => client.init(auth))
      .then(() =>
        numbers(client, avgWindow, (output) => {
          socket.emit('data', output);
          // const output = Object.keys(averages)
           // console.log(output)
        })
      )
  }
})
