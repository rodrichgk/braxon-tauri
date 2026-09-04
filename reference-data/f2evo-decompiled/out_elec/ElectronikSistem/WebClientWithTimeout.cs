using System;
using System.Net;

namespace ElectronikSistem;

public class WebClientWithTimeout : WebClient
{
	public int Timeout { get; set; }

	protected override WebRequest GetWebRequest(Uri uri)
	{
		WebRequest webRequest = base.GetWebRequest(uri);
		webRequest.Timeout = Timeout;
		((HttpWebRequest)webRequest).ReadWriteTimeout = Timeout;
		return webRequest;
	}
}
