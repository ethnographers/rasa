using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using SocketIO;


public class Network : MonoBehaviour {

	static SocketIOComponent socket;

	void Start ()
	{
		socket = GetComponent<SocketIOComponent> ();
		socket.On ("open", OnConnected);
		socket.On ("data", OnData);
		
	}
	
	void OnConnected(SocketIOEvent e)
	{
		Debug.Log ("connected");
		Debug.Log (e);
		socket.Emit("test");
	}

	void OnData(SocketIOEvent obj)
	{
		Debug.Log (obj);
	}
}
