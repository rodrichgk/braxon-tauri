using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace ElectronikSistem;

public class Json
{
	public static string URL;

	public static string Host = "www.testbenches.eu";

	public Json()
	{
		ServicePointManager.ServerCertificateValidationCallback = (object s, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors) => true;
		if (SystemInformation.ComputerName != "3DLAB")
		{
			Host = "www.testbenches.eu";
		}
	}

	private string Request(string url)
	{
		HttpWebRequest httpWebRequest = (HttpWebRequest)WebRequest.Create(url);
		httpWebRequest.ContentType = "application/x-www-form-urlencoded";
		httpWebRequest.Method = "GET";
		httpWebRequest.Accept = "application/json";
		WebResponse response = httpWebRequest.GetResponse();
		using StreamReader streamReader = new StreamReader(response.GetResponseStream());
		return streamReader.ReadToEnd();
	}

	public string UploadString()
	{
		string text = Request("http://" + Host + URL + "/UploadString?seconds=0");
		if (text.IndexOf("Error:") == 0)
		{
			throw new Exception(text);
		}
		return text;
	}

	public string Exsecute(string query)
	{
		string text = Request("http://" + Host + URL + "/Exsecute?query=" + query);
		if (text.IndexOf("Error:") == 0)
		{
			throw new Exception(text);
		}
		return text;
	}

	public string GetValue(string query)
	{
		string text = Request("http://" + Host + URL + "/GetValue?query=" + query);
		if (text.IndexOf("Error:") == 0)
		{
			throw new Exception(text);
		}
		return text;
	}

	public DataTable LoadTable(string query)
	{
		string text = Request("http://" + Host + URL + "/LoadTable?query=" + query).Replace("[{", "").Replace("}]", "").Replace("},{", "\u0002")
			.Replace("\"", "");
		if (text.IndexOf("Error:") == 0)
		{
			throw new Exception(text);
		}
		DataTable dataTable = new DataTable();
		if (text != "[]")
		{
			string[] array = text.Split("\u0002"[0]);
			string[] array2 = array[0].Split(","[0]);
			foreach (string text2 in array2)
			{
				dataTable.Columns.Add(text2.Split(":"[0])[0]);
			}
			List<object> list = new List<object>();
			string[] array3 = array;
			foreach (string text3 in array3)
			{
				list.Clear();
				string[] array4 = text3.Split(","[0]);
				foreach (string text4 in array4)
				{
					list.Add(text4.Split(":"[0])[1]);
				}
				dataTable.Rows.Add(list.ToArray());
			}
		}
		return dataTable;
	}

	public DataTable Table(DataTable src)
	{
		DataTable dataTable = new DataTable();
		if (dataTable.Columns.Count == 0)
		{
			foreach (DataColumn column in src.Columns)
			{
				if (column.ColumnName == "ID")
				{
					dataTable.Columns.Add(column.ColumnName, typeof(uint));
				}
				else if (column.ColumnName.IndexOf("Address") > -1)
				{
					dataTable.Columns.Add(column.ColumnName, typeof(uint));
				}
				else
				{
					dataTable.Columns.Add(column.ColumnName, typeof(byte));
				}
			}
		}
		return dataTable;
	}
}
