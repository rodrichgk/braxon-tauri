using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace ElectronikSistem;

public class FTP
{
	public FTP()
	{
		ServicePointManager.ServerCertificateValidationCallback = (object s, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors) => true;
	}

	public static List<string> List(string PartNumber)
	{
		string text = "";
		string text2 = "";
		try
		{
			FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(new Uri("ftp://ftp.testbenches.eu/testbenches.eu/firmware/" + PartNumber));
			ftpWebRequest.Timeout = 5000;
			ftpWebRequest.Credentials = new NetworkCredential("6058546@aruba.it", "#Gn7CMLf@Xe9");
			ftpWebRequest.Method = "NLST";
			FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
			StreamReader streamReader = new StreamReader(ftpWebResponse.GetResponseStream());
			SortedList<string, string> sortedList = new SortedList<string, string>();
			text = streamReader.ReadLine();
			text2 = text;
			while (!string.IsNullOrEmpty(text))
			{
				sortedList.Add(text, text);
				text = streamReader.ReadLine();
				text2 += text;
			}
			streamReader.Close();
			return sortedList.Values.ToList();
		}
		catch (WebException)
		{
			MessageBox.Show("Error: Part Number board.\r\n\r\n[" + PartNumber + "]\r\n\r\nResponse[" + text2 + "]", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return null;
		}
		catch (Exception)
		{
			MessageBox.Show("Error: Part Number board.\r\n\r\n[" + PartNumber + "]\r\n\r\nResponse[" + text2 + "]", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return null;
		}
	}

	public static void Upload(UploadProgressChangedEventHandler UploadProgress, UploadFileCompletedEventHandler UploadCompleted)
	{
		WebClient webClient = new WebClient();
		webClient.Credentials = new NetworkCredential("6058546@aruba.it", "#Gn7CMLf@Xe9");
		string processName = Process.GetCurrentProcess().ProcessName;
		Uri address = new Uri("ftp://ftp.testbenches.eu/testbenches.eu/App_Data/" + processName + "/" + processName + ".accdb");
		webClient.UploadProgressChanged += UploadProgress.Invoke;
		webClient.UploadFileCompleted += UploadCompleted.Invoke;
		webClient.UploadFileAsync(address, processName + ".accdb");
	}

	public static void Download(DownloadProgressChangedEventHandler DownloadProgress, AsyncCompletedEventHandler DownloadCompleted)
	{
		WebClient webClient = new WebClient();
		webClient.Credentials = new NetworkCredential("6058546@aruba.it", "#Gn7CMLf@Xe9");
		string processName = Process.GetCurrentProcess().ProcessName;
		Uri address = new Uri("ftp://ftp.testbenches.eu/testbenches.eu/App_Data/" + processName + "/Update.accdb");
		webClient.DownloadProgressChanged += DownloadProgress.Invoke;
		webClient.DownloadFileCompleted += DownloadCompleted.Invoke;
		webClient.DownloadFileAsync(address, processName + ".accdb");
	}

	public static long GetSize()
	{
		string processName = Process.GetCurrentProcess().ProcessName;
		FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(new Uri("ftp://ftp.testbenches.eu/testbenches.eu/App_Data/" + processName + "/" + processName + ".accdb"));
		ftpWebRequest.Timeout = 5000;
		ftpWebRequest.Proxy = null;
		ftpWebRequest.Credentials = new NetworkCredential("6058546@aruba.it", "#Gn7CMLf@Xe9");
		ftpWebRequest.Method = "SIZE";
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		long contentLength = ftpWebResponse.ContentLength;
		ftpWebResponse.Close();
		return contentLength;
	}

	public static MemoryStream Download(string SrcFile)
	{
		FtpWebRequest ftpWebRequest = null;
		Uri requestUri = new Uri("ftp://ftp.testbenches.eu/testbenches.eu/firmware/" + SrcFile);
		ftpWebRequest = (FtpWebRequest)WebRequest.Create(requestUri);
		ftpWebRequest.Credentials = new NetworkCredential("6058546@aruba.it", "#Gn7CMLf@Xe9");
		ftpWebRequest.UseBinary = false;
		ftpWebRequest.UsePassive = true;
		ftpWebRequest.KeepAlive = false;
		ftpWebRequest.EnableSsl = false;
		ftpWebRequest.Method = "RETR";
		ftpWebRequest.Timeout = 5000;
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		Stream responseStream = ftpWebResponse.GetResponseStream();
		MemoryStream memoryStream = null;
		memoryStream = new MemoryStream();
		int num = 2048;
		byte[] buffer = new byte[num];
		for (int num2 = responseStream.Read(buffer, 0, num); num2 > 0; num2 = responseStream.Read(buffer, 0, num))
		{
			memoryStream.Write(buffer, 0, num2);
		}
		responseStream.Close();
		ftpWebResponse.Close();
		ftpWebRequest = null;
		return memoryStream;
	}

	public static void Upload(MemoryStream memoryStream, string URL, string user, string password)
	{
		WebRequest webRequest = WebRequest.Create(URL);
		webRequest.Method = "STOR";
		webRequest.Credentials = new NetworkCredential(user, password);
		using (Stream destination = webRequest.GetRequestStream())
		{
			memoryStream.CopyTo(destination);
			memoryStream.Close();
		}
		webRequest.GetResponse().Close();
	}

	public static MemoryStream Download(string URL, string user, string password)
	{
		FtpWebRequest ftpWebRequest = null;
		Uri requestUri = new Uri(URL);
		ftpWebRequest = (FtpWebRequest)WebRequest.Create(requestUri);
		ftpWebRequest.Credentials = new NetworkCredential(user, password);
		ftpWebRequest.UseBinary = false;
		ftpWebRequest.UsePassive = true;
		ftpWebRequest.KeepAlive = false;
		ftpWebRequest.EnableSsl = false;
		ftpWebRequest.Method = "RETR";
		ftpWebRequest.Timeout = 3000;
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		Stream responseStream = ftpWebResponse.GetResponseStream();
		MemoryStream memoryStream = null;
		memoryStream = new MemoryStream();
		int num = 2048;
		byte[] buffer = new byte[num];
		for (int num2 = responseStream.Read(buffer, 0, num); num2 > 0; num2 = responseStream.Read(buffer, 0, num))
		{
			memoryStream.Write(buffer, 0, num2);
		}
		responseStream.Close();
		ftpWebResponse.Close();
		ftpWebRequest = null;
		return memoryStream;
	}

	public static void Upload(string file, string URL, string user, string password, UploadProgressChangedEventHandler UploadProgress, UploadFileCompletedEventHandler UploadCompleted)
	{
		WebClient webClient = new WebClient();
		webClient.Credentials = new NetworkCredential(user, password);
		Uri address = new Uri(URL);
		if (UploadProgress != null)
		{
			webClient.UploadProgressChanged += UploadProgress.Invoke;
		}
		if (UploadCompleted != null)
		{
			webClient.UploadFileCompleted += UploadCompleted.Invoke;
		}
		webClient.UploadFileAsync(address, file);
	}

	public static void Download(string file, string URL, string user, string password, DownloadProgressChangedEventHandler DownloadProgress, AsyncCompletedEventHandler DownloadCompleted)
	{
		WebClient webClient = new WebClient();
		webClient.Credentials = new NetworkCredential(user, password);
		Uri address = new Uri(URL);
		if (DownloadProgress != null)
		{
			webClient.DownloadProgressChanged += DownloadProgress.Invoke;
		}
		if (DownloadCompleted != null)
		{
			webClient.DownloadFileCompleted += DownloadCompleted.Invoke;
		}
		webClient.DownloadFileAsync(address, file);
	}

	public static long GetSize(string URL, string user, string password)
	{
		FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(new Uri(URL));
		ftpWebRequest.Timeout = 5000;
		ftpWebRequest.Proxy = null;
		ftpWebRequest.Credentials = new NetworkCredential(user, password);
		ftpWebRequest.Method = "SIZE";
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		long contentLength = ftpWebResponse.ContentLength;
		ftpWebResponse.Close();
		return contentLength;
	}

	public static DateTime GetLastWriteTime(string URL, string user, string password)
	{
		FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(URL);
		ftpWebRequest.Timeout = 5000;
		ftpWebRequest.Proxy = null;
		ftpWebRequest.Credentials = new NetworkCredential(user, password);
		ftpWebRequest.Method = "MDTM";
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		return ftpWebResponse.LastModified;
	}

	public static void CreaFolder(string URL, string user, string password)
	{
		WebRequest webRequest = WebRequest.Create(URL);
		webRequest.Timeout = 5000;
		webRequest.Method = "MKD";
		webRequest.Credentials = new NetworkCredential(user, password);
		using FtpWebResponse ftpWebResponse = (FtpWebResponse)webRequest.GetResponse();
		Console.WriteLine(ftpWebResponse.StatusCode);
		ftpWebResponse.Close();
	}

	public static void RemoveFolder(string URL, string user, string password)
	{
		WebRequest webRequest = WebRequest.Create(URL);
		webRequest.Timeout = 5000;
		webRequest.Method = "RMD";
		webRequest.Credentials = new NetworkCredential(user, password);
		using FtpWebResponse ftpWebResponse = (FtpWebResponse)webRequest.GetResponse();
		Console.WriteLine(ftpWebResponse.StatusCode);
		ftpWebResponse.Close();
	}

	public static void RemoveFile(string URL, string user, string password)
	{
		WebRequest webRequest = WebRequest.Create(URL);
		webRequest.Timeout = 5000;
		webRequest.Method = "DELE";
		webRequest.Credentials = new NetworkCredential(user, password);
		using FtpWebResponse ftpWebResponse = (FtpWebResponse)webRequest.GetResponse();
		Console.WriteLine(ftpWebResponse.StatusCode);
		ftpWebResponse.Close();
	}

	public static bool FileExist(string URL, string user, string password)
	{
		return DirectoryExist(URL, user, password);
	}

	public static bool DirectoryExist(string URL, string user, string password)
	{
		try
		{
			int num = URL.LastIndexOf("/");
			string item = URL.Substring(num + 1).ToUpper();
			URL = URL.Substring(0, num);
			List<string> list = List(URL, user, password);
			for (int i = 0; i < list.Count; i++)
			{
				list[i] = list[i].ToUpper();
			}
			return list.Contains(item);
		}
		catch (WebException)
		{
			return false;
		}
	}

	public static List<string> List(string URL, string user, string password)
	{
		string text = "";
		string text2 = "";
		try
		{
			FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(new Uri(URL));
			ftpWebRequest.Timeout = 5000;
			ftpWebRequest.Credentials = new NetworkCredential(user, password);
			ftpWebRequest.Method = "NLST";
			FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
			StreamReader streamReader = new StreamReader(ftpWebResponse.GetResponseStream());
			SortedList<string, string> sortedList = new SortedList<string, string>();
			text = streamReader.ReadLine();
			text2 = text;
			while (!string.IsNullOrEmpty(text))
			{
				sortedList.Add(text, text);
				text = streamReader.ReadLine();
				text2 += text;
			}
			streamReader.Close();
			return sortedList.Values.ToList();
		}
		catch (WebException)
		{
			return null;
		}
		catch (Exception)
		{
			return null;
		}
	}

	public static bool UploadUniqueFileOnServer(Uri serverUri, string fileName)
	{
		if (serverUri.Scheme != Uri.UriSchemeFtp)
		{
			return false;
		}
		FtpWebRequest ftpWebRequest = (FtpWebRequest)WebRequest.Create(serverUri);
		ftpWebRequest.Method = "STOU";
		ftpWebRequest.Timeout = 600000;
		byte[] buffer = new byte[2048];
		int num = 0;
		int num2 = 0;
		FileStream fileStream = File.OpenRead(fileName);
		Stream requestStream = ftpWebRequest.GetRequestStream();
		do
		{
			num2 = fileStream.Read(buffer, 0, 2048);
			requestStream.Write(buffer, 0, 2048);
			num += num2;
		}
		while (num2 != 0);
		Console.WriteLine("Writing {0} bytes to the stream.", num);
		requestStream.Close();
		FtpWebResponse ftpWebResponse = (FtpWebResponse)ftpWebRequest.GetResponse();
		Console.WriteLine("Upload status: {0}, {1}", ftpWebResponse.StatusCode, ftpWebResponse.StatusDescription);
		Console.WriteLine("File name: {0}", ftpWebResponse.ResponseUri);
		ftpWebResponse.Close();
		return true;
	}
}
