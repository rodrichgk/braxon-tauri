using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml;

namespace ElectronikSistem;

public class HTTP
{
	public delegate void Handle_Request(Socket client, string request);

	public delegate void Handle_Response(string response, string host);

	private TcpListener listener;

	private List<Socket> Clients = new List<Socket>();

	private Timer Polling;

	public string Host;

	public string IP;

	public string URL;

	public string Port = "80";

	private string UserName = "ProLocoSanMartino";

	private string PassWord = "7f76s3gx";

	public event Handle_Request EventHandlerRequest;

	public event Handle_Response EventHandlerResponse;

	public HTTP(int Port)
	{
		Polling = new Timer();
		Polling.Interval = 100;
		Polling.Tick += Polling_Tick;
		Polling.Enabled = true;
		listener = new TcpListener(IPAddress.Any, Port);
		listener.Start();
		AcceptClient();
	}

	public void Stop()
	{
		if (listener != null)
		{
			listener.Stop();
		}
	}

	~HTTP()
	{
		if (listener != null)
		{
			listener.Stop();
		}
		listener = null;
	}

	private void AcceptClient()
	{
		listener.BeginAcceptSocket(ClientConnected, null);
	}

	private void ClientConnected(IAsyncResult ar)
	{
		try
		{
			Socket item = listener.EndAcceptSocket(ar);
			Clients.Add(item);
			AcceptClient();
		}
		catch
		{
		}
	}

	private void Polling_Tick(object sender, EventArgs e)
	{
		for (int i = 0; i < Clients.Count; i++)
		{
			byte[] bytes = ReceiveAll(Clients[i]);
			string text = Encoding.GetEncoding("ISO-8859-1").GetString(bytes);
			int num = text.IndexOf("GET /");
			int num2 = text.IndexOf("HTTP/1.1");
			if (num > -1 && num2 > -1)
			{
				num += 5;
				string request = text.Substring(num, num2 - num).Trim();
				if (this.EventHandlerRequest != null)
				{
					this.EventHandlerRequest(Clients[i], request);
				}
			}
		}
	}

	private byte[] ReceiveAll(Socket socket)
	{
		List<byte> list = new List<byte>();
		while (socket.Available > 0)
		{
			byte[] array = new byte[1];
			if (socket.Receive(array, array.Length, SocketFlags.None).Equals(1))
			{
				list.Add(array[0]);
			}
		}
		return list.ToArray();
	}

	public void SendPage(Socket socket, string response)
	{
		byte[] bytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(response);
		socket.Send(bytes);
	}

	public HTTP()
	{
	}

	public Task<string> HttpAsyncRequest(HTTP HTTPObject, string url, string contentType)
	{
		HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
		request.ContentType = contentType;
		request.Method = "GET";
		request.Timeout = 2000;
		request.Proxy = null;
		request.ContentType = "application/x-www-form-urlencoded";
		request.Accept = "application/json";
		request.KeepAlive = false;
		try
		{
			Task<string[]> task = Task.Factory.FromAsync(request.BeginGetResponse, delegate(IAsyncResult asyncResult)
			{
				try
				{
					WebResponse webResponse = request.EndGetResponse(asyncResult);
					string text;
					using (Stream stream = webResponse.GetResponseStream())
					{
						using StreamReader streamReader = new StreamReader(stream);
						text = streamReader.ReadToEnd();
						streamReader.Close();
						streamReader.Dispose();
					}
					string host = webResponse.ResponseUri.Host;
					webResponse.Close();
					return new string[2] { text, host };
				}
				catch (Exception ex)
				{
					return new string[2]
					{
						"Error: " + ex.Message,
						"0.0.0.0"
					};
				}
			}, null);
			return task.ContinueWith((Task<string[]> t) => ReadStreamFromResponse(HTTPObject, t.Result));
		}
		catch
		{
			return Task.Factory.StartNew(() => "");
		}
	}

	private Task<string> HttpAsyncRequest(HTTP HTTPObject, string[] Request)
	{
		string text = Request[0];
		string xml = Request[1];
		string text2 = "http://" + IP + ":" + Port + "/" + URL + "?op=" + text;
		HttpWebRequest request = (HttpWebRequest)WebRequest.Create(text2 + text);
		request.Headers.Add("SOAP:Action");
		request.ContentType = "application/soap+xml; charset=utf-8";
		request.Accept = "text/xml";
		request.Method = "POST";
		XmlDocument xmlDocument = new XmlDocument();
		xmlDocument.LoadXml(xml);
		try
		{
			using (Stream outStream = request.GetRequestStream())
			{
				xmlDocument.Save(outStream);
			}
			Task<string> task = Task.Factory.FromAsync(request.BeginGetResponse, delegate
			{
				string result = "";
				try
				{
					using WebResponse webResponse = request.GetResponse();
					using StreamReader streamReader = new StreamReader(webResponse.GetResponseStream());
					result = streamReader.ReadToEnd();
				}
				catch (Exception ex)
				{
					result = "Error: " + ex.Message;
				}
				return result;
			}, null);
			return task.ContinueWith((Task<string> t) => ReadStreamFromResponse(HTTPObject, t.Result));
		}
		catch
		{
			return Task.Factory.StartNew(() => "");
		}
	}

	public string GetExternalIP()
	{
		using WebClient webClient = new WebClient();
		return webClient.DownloadString("https://api.ipify.org/");
	}

	private string IPRequestHelper(string url)
	{
		HttpWebRequest httpWebRequest = (HttpWebRequest)WebRequest.Create(url);
		httpWebRequest.ContentType = "text/html";
		httpWebRequest.Method = "GET";
		httpWebRequest.Timeout = 2000;
		httpWebRequest.Proxy = null;
		httpWebRequest.ContentType = "application/x-www-form-urlencoded";
		httpWebRequest.Accept = "application/json";
		httpWebRequest.KeepAlive = false;
		HttpWebResponse httpWebResponse = (HttpWebResponse)httpWebRequest.GetResponse();
		StreamReader streamReader = new StreamReader(httpWebResponse.GetResponseStream());
		string result = streamReader.ReadToEnd();
		streamReader.Close();
		streamReader.Dispose();
		return result;
	}

	public IpProperties GetCountryByIP(string ipAddress)
	{
		string s = IPRequestHelper("http://ip-api.com/xml/" + ipAddress);
		using TextReader reader = new StringReader(s);
		using DataSet dataSet = new DataSet();
		IpProperties ipProperties = new IpProperties();
		dataSet.ReadXml(reader);
		ipProperties.Status = dataSet.Tables[0].Rows[0][0].ToString();
		ipProperties.Country = dataSet.Tables[0].Rows[0][1].ToString();
		ipProperties.CountryCode = dataSet.Tables[0].Rows[0][2].ToString();
		ipProperties.Region = dataSet.Tables[0].Rows[0][3].ToString();
		ipProperties.RegionName = dataSet.Tables[0].Rows[0][4].ToString();
		ipProperties.City = dataSet.Tables[0].Rows[0][5].ToString();
		ipProperties.Zip = dataSet.Tables[0].Rows[0][6].ToString();
		ipProperties.Lat = dataSet.Tables[0].Rows[0][7].ToString();
		ipProperties.Lon = dataSet.Tables[0].Rows[0][8].ToString();
		ipProperties.TimeZone = dataSet.Tables[0].Rows[0][9].ToString();
		ipProperties.ISP = dataSet.Tables[0].Rows[0][10].ToString();
		ipProperties.ORG = dataSet.Tables[0].Rows[0][11].ToString();
		ipProperties.AS = dataSet.Tables[0].Rows[0][12].ToString();
		ipProperties.Query = dataSet.Tables[0].Rows[0][13].ToString();
		return ipProperties;
	}

	private string ReadStreamFromResponse(object sender, string[] response)
	{
		HTTP hTTP = (HTTP)sender;
		int num = response[0].IndexOf("Error");
		int num2 = response[0].IndexOf("EsitiError");
		if (num - num2 != 5 && num > -1)
		{
			return response[0];
		}
		if (hTTP.EventHandlerResponse != null)
		{
			hTTP.EventHandlerResponse(response[0], response[1]);
		}
		return "OK";
	}

	private string ReadStreamFromResponse(object sender, string response)
	{
		HTTP hTTP = (HTTP)sender;
		int num = response.IndexOf("Error");
		int num2 = response.IndexOf("EsitiError");
		if (num - num2 != 5 && num > -1)
		{
			return response;
		}
		if (hTTP.EventHandlerResponse != null)
		{
			hTTP.EventHandlerResponse(response, "OK");
		}
		return "OK";
	}

	public void SendRequest(string URL)
	{
		Task<string> task = HttpAsyncRequest(this, URL, "text/html");
	}

	public void LoadTable(string query)
	{
		string text = "LoadTable";
		string text2 = string.Format("<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n                                        <soap12:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soap12=\"http://www.w3.org/2003/05/soap-envelope\">\r\n                                          <soap12:Header>\r\n                                            <LogIn xmlns=\"http://tempuri.org/\">\r\n                                              <UserName>{1}</UserName>\r\n                                              <PassWord>{2}</PassWord>\r\n                                            </LogIn>\r\n                                          </soap12:Header>\r\n                                          <soap12:Body>\r\n                                            <{0} xmlns=\"http://tempuri.org/\">\r\n                                              <query>{3}</query>\r\n                                            </{0}>\r\n                                          </soap12:Body>\r\n                                        </soap12:Envelope>", text, UserName, PassWord, query);
		string[] request = new string[2] { text, text2 };
		Task<string> task = HttpAsyncRequest(this, request);
	}

	public void LoadReport(string action, string UserName, string Code, int ID)
	{
		string text = string.Format("<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n                                        <soap12:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soap12=\"http://www.w3.org/2003/05/soap-envelope\">\r\n                                          <soap12:Header>\r\n                                            <LogIn xmlns=\"http://tempuri.org/\">\r\n                                              <UserName>{1}</UserName>\r\n                                              <PassWord>{2}</PassWord>\r\n                                            </LogIn>\r\n                                          </soap12:Header>\r\n                                          <soap12:Body>\r\n                                            <{0} xmlns=\"http://tempuri.org/\">\r\n                                              <UserName>{3}</UserName>\r\n                                              <Code>{4}</Code>\r\n                                              <CarsServiceID>{5}</CarsServiceID>\r\n                                            </{0}>\r\n                                          </soap12:Body>\r\n                                        </soap12:Envelope>", action, UserName, PassWord, UserName, Code, ID);
		string[] request = new string[2] { action, text };
		Task<string> task = HttpAsyncRequest(this, request);
	}
}
