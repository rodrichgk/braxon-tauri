using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Ports;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ElectronikSistem;

public class Sistem
{
	public static List<string> GetPortCom(int i)
	{
		return GetPortCom();
	}

	public static List<string> GetPortCom()
	{
		List<string> list2;
		using (ManagementObjectSearcher managementObjectSearcher = new ManagementObjectSearcher("SELECT * FROM WIN32_SerialPort"))
		{
			List<ManagementBaseObject> inner = managementObjectSearcher.Get().Cast<ManagementBaseObject>().ToList();
			string[] portNames = SerialPort.GetPortNames();
			List<string> list = (from n in portNames
				join p in inner on n equals p["DeviceID"].ToString()
				select n + " - " + p["Caption"]?.ToString() + "-" + p["DeviceID"]).ToList();
			list2 = portNames.ToList();
			foreach (string item2 in list)
			{
				string item = item2.Split('-')[0].Trim();
				string text = item2.Split('-')[1].Trim();
				if (text.IndexOf("Bluetooth") > -1)
				{
					list2.Remove(item);
				}
			}
		}
		return list2;
	}

	public static string GetDeviceUSB(string portname)
	{
		using (ManagementObjectSearcher managementObjectSearcher = new ManagementObjectSearcher("SELECT * FROM WIN32_SerialPort"))
		{
			List<ManagementBaseObject> inner = managementObjectSearcher.Get().Cast<ManagementBaseObject>().ToList();
			string[] portNames = SerialPort.GetPortNames();
			List<string> list = (from n in portNames
				join p in inner on n equals p["DeviceID"].ToString()
				select n + " - " + p["Caption"]?.ToString() + "-" + p["DeviceID"]).ToList();
			foreach (string item in list)
			{
				if (item.IndexOf(portname) > -1)
				{
					return item.Replace(portname, "").Replace("()-", "").Replace("-", "")
						.Trim();
				}
			}
		}
		return null;
	}

	public static byte[] Serialize(object obj)
	{
		int num = Marshal.SizeOf(obj);
		byte[] array = new byte[num];
		IntPtr intPtr = Marshal.AllocHGlobal(num);
		Marshal.StructureToPtr(obj, intPtr, fDeleteOld: false);
		Marshal.Copy(intPtr, array, 0, num);
		Marshal.FreeHGlobal(intPtr);
		return array;
	}

	public static FieldInfo[] GetFields()
	{
		return typeof(SerialPort).GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
	}

	public static void RemoveControlEvent(Control b, string Event)
	{
		FieldInfo field = typeof(Control).GetField(Event, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
		object value = field.GetValue(b);
		PropertyInfo property = b.GetType().GetProperty("Events", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
		EventHandlerList eventHandlerList = (EventHandlerList)property.GetValue(b, null);
		eventHandlerList.RemoveHandler(value, eventHandlerList[value]);
	}

	public static void RemovePortEvent(SerialPort b, string Event)
	{
		FieldInfo field = typeof(SerialPort).GetField("DataReceived", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
		object value = field.GetValue(b);
		PropertyInfo property = b.GetType().GetProperty("Events", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
		EventHandlerList eventHandlerList = (EventHandlerList)property.GetValue(b, null);
		eventHandlerList.RemoveHandler(value, eventHandlerList[value]);
	}

	public static bool isRdInstalled(string application)
	{
		int num = 0;
		ManagementObjectSearcher managementObjectSearcher = new ManagementObjectSearcher("SELECT * FROM Win32_Product");
		foreach (ManagementObject item in managementObjectSearcher.Get())
		{
			if (item != null && item.GetPropertyValue("Name") != null && item.GetPropertyValue("Name").ToString().Contains(application))
			{
				num++;
			}
		}
		return false;
	}

	public static string GetUninstallStringApplicationInstalled(string p_name)
	{
		RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames = registryKey.GetSubKeyNames();
		foreach (string name in subKeyNames)
		{
			RegistryKey registryKey2 = registryKey.OpenSubKey(name);
			string text = registryKey2.GetValue("DisplayName") as string;
			string text2 = registryKey2.GetValue("DisplayVersion") as string;
			string result = registryKey2.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return result;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames2 = registryKey.GetSubKeyNames();
		foreach (string name2 in subKeyNames2)
		{
			RegistryKey registryKey3 = registryKey.OpenSubKey(name2);
			string text = registryKey3.GetValue("DisplayName") as string;
			string text2 = registryKey3.GetValue("DisplayVersion") as string;
			string result = registryKey3.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return result;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames3 = registryKey.GetSubKeyNames();
		foreach (string name3 in subKeyNames3)
		{
			RegistryKey registryKey4 = registryKey.OpenSubKey(name3);
			string text = registryKey4.GetValue("DisplayName") as string;
			string text2 = registryKey4.GetValue("DisplayVersion") as string;
			string result = registryKey4.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return result;
			}
		}
		return "";
	}

	public static string GetInstallSourceStringApplicationInstalled(string p_name)
	{
		try
		{
			RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Installer");
			string[] subKeyNames = registryKey.GetSubKeyNames();
			foreach (string name in subKeyNames)
			{
				RegistryKey registryKey2 = registryKey.OpenSubKey(name);
				string[] valueNames = registryKey2.GetValueNames();
				foreach (string text in valueNames)
				{
					if (text.IndexOf(p_name) > -1)
					{
						return Path.GetDirectoryName(text);
					}
				}
			}
		}
		catch
		{
		}
		try
		{
			RegistryKey registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Installer");
			string[] subKeyNames2 = registryKey.GetSubKeyNames();
			foreach (string name2 in subKeyNames2)
			{
				RegistryKey registryKey3 = registryKey.OpenSubKey(name2);
				string[] valueNames2 = registryKey3.GetValueNames();
				foreach (string text2 in valueNames2)
				{
					if (text2.IndexOf(p_name) > -1)
					{
						return Path.GetDirectoryName(text2);
					}
				}
			}
		}
		catch
		{
		}
		try
		{
			RegistryKey registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Installer");
			string[] subKeyNames3 = registryKey.GetSubKeyNames();
			foreach (string name3 in subKeyNames3)
			{
				RegistryKey registryKey4 = registryKey.OpenSubKey(name3);
				string[] valueNames3 = registryKey4.GetValueNames();
				foreach (string text3 in valueNames3)
				{
					if (text3.IndexOf(p_name) > -1)
					{
						return Path.GetDirectoryName(text3);
					}
				}
			}
		}
		catch
		{
		}
		return "";
	}

	public static string GetMachineID()
	{
		try
		{
			RegistryKey registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\SQMClient");
			string[] valueNames = registryKey.GetValueNames();
			foreach (string text in valueNames)
			{
				if (text.IndexOf("MachineID") > -1)
				{
					return registryKey.GetValue(text).ToString();
				}
			}
		}
		catch
		{
		}
		return "";
	}

	public static bool ChangeVersionApplicationInstalled(string p_name, string value)
	{
		RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", writable: true);
		string[] subKeyNames = registryKey.GetSubKeyNames();
		foreach (string name in subKeyNames)
		{
			RegistryKey registryKey2 = registryKey.OpenSubKey(name, writable: true);
			if (registryKey2.GetValue("DisplayName") is string text && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				registryKey2.SetValue("DisplayVersion", value);
				return true;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", writable: true);
		string[] subKeyNames2 = registryKey.GetSubKeyNames();
		foreach (string name2 in subKeyNames2)
		{
			RegistryKey registryKey3 = registryKey.OpenSubKey(name2, writable: true);
			if (registryKey3.GetValue("DisplayName") is string text2 && text2 == p_name && p_name.Equals(text2, StringComparison.OrdinalIgnoreCase))
			{
				registryKey3.SetValue("DisplayVersion", value);
				return true;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", writable: true);
		string[] subKeyNames3 = registryKey.GetSubKeyNames();
		foreach (string name3 in subKeyNames3)
		{
			RegistryKey registryKey4 = registryKey.OpenSubKey(name3, writable: true);
			if (registryKey4.GetValue("DisplayName") is string text3 && text3 == p_name && p_name.Equals(text3, StringComparison.OrdinalIgnoreCase))
			{
				registryKey4.SetValue("DisplayVersion", value);
				return true;
			}
		}
		return false;
	}

	public static bool IsApplicationInstalled(string p_name, out string displayVersion)
	{
		RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames = registryKey.GetSubKeyNames();
		foreach (string name in subKeyNames)
		{
			RegistryKey registryKey2 = registryKey.OpenSubKey(name);
			string text = registryKey2.GetValue("DisplayName") as string;
			displayVersion = registryKey2.GetValue("DisplayVersion") as string;
			string text2 = registryKey2.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return true;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames2 = registryKey.GetSubKeyNames();
		foreach (string name2 in subKeyNames2)
		{
			RegistryKey registryKey3 = registryKey.OpenSubKey(name2);
			string text = registryKey3.GetValue("DisplayName") as string;
			displayVersion = registryKey3.GetValue("DisplayVersion") as string;
			string text2 = registryKey3.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return true;
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames3 = registryKey.GetSubKeyNames();
		foreach (string name3 in subKeyNames3)
		{
			RegistryKey registryKey4 = registryKey.OpenSubKey(name3);
			string text = registryKey4.GetValue("DisplayName") as string;
			displayVersion = registryKey4.GetValue("DisplayVersion") as string;
			string text2 = registryKey4.GetValue("UninstallString") as string;
			if (text != null && text == p_name && p_name.Equals(text, StringComparison.OrdinalIgnoreCase))
			{
				return true;
			}
		}
		displayVersion = "";
		return false;
	}

	public static string GetProviderDataBase()
	{
		string processName = Process.GetCurrentProcess().ProcessName;
		string result = "Provider=Microsoft.Jet.OLEDB.4.0; Data Source=" + processName + ".accdb; Jet OLEDB:Database Password=;";
		RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames = registryKey.GetSubKeyNames();
		string text2;
		foreach (string name in subKeyNames)
		{
			RegistryKey registryKey2 = registryKey.OpenSubKey(name);
			string text = registryKey2.GetValue("DisplayName") as string;
			text2 = registryKey2.GetValue("DisplayVersion") as string;
			if (text != null && text.IndexOf("Microsoft Access database engine") > -1)
			{
				result = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + processName + ".accdb";
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames2 = registryKey.GetSubKeyNames();
		foreach (string name2 in subKeyNames2)
		{
			RegistryKey registryKey3 = registryKey.OpenSubKey(name2);
			string text = registryKey3.GetValue("DisplayName") as string;
			text2 = registryKey3.GetValue("DisplayVersion") as string;
			if (text != null && text.IndexOf("Microsoft Access database engine") > -1)
			{
				result = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + processName + ".accdb";
			}
		}
		registryKey = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall");
		string[] subKeyNames3 = registryKey.GetSubKeyNames();
		foreach (string name3 in subKeyNames3)
		{
			RegistryKey registryKey4 = registryKey.OpenSubKey(name3);
			string text = registryKey4.GetValue("DisplayName") as string;
			text2 = registryKey4.GetValue("DisplayVersion") as string;
			if (text != null && text.IndexOf("Microsoft Access database engine") > -1)
			{
				result = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + processName + ".accdb";
			}
		}
		text2 = "";
		return result;
	}

	public static bool StartProcess(string FileName, string Arguments)
	{
		Process process = new Process();
		string workingDirectory = FileName.Replace("\\" + Path.GetFileName(FileName), "");
		try
		{
			process.StartInfo.WorkingDirectory = workingDirectory;
			process.StartInfo.UseShellExecute = true;
			process.StartInfo.CreateNoWindow = true;
			process.StartInfo.FileName = FileName;
			process.StartInfo.Arguments = Arguments;
			process.StartInfo.Verb = "runas";
			process.Start();
			process.WaitForExit();
			return true;
		}
		catch (Exception ex)
		{
			MessageBox.Show("\r\n\r\n" + ex.Message + "\r\n\r\nUnable to run Application.");
			return false;
		}
	}

	public static bool GetCredential()
	{
		try
		{
			MemoryStream stream = FTP.Download("ftp://ftp.testbenches.eu/testbenches.eu/Software/Host-PC.txt", "6058546@aruba.it", "#Gn7CMLf@Xe9");
			StreamReader streamReader = new StreamReader(stream);
			streamReader.BaseStream.Position = 0L;
			while (!streamReader.EndOfStream)
			{
				string text = streamReader.ReadLine();
				if (text == SystemInformation.ComputerName)
				{
					return true;
				}
			}
		}
		catch
		{
		}
		return false;
	}

	public static bool GetCredential(string domin, string login, string passoword)
	{
		try
		{
			MemoryStream stream = FTP.Download(domin + "Software/Host-PC.txt", login, passoword);
			StreamReader streamReader = new StreamReader(stream);
			streamReader.BaseStream.Position = 0L;
			while (!streamReader.EndOfStream)
			{
				string text = streamReader.ReadLine();
				if (text == SystemInformation.ComputerName)
				{
					return true;
				}
			}
		}
		catch
		{
		}
		return false;
	}

	public static bool IsFileShareServerOnline(string PCName, int Timeout = 3000)
	{
		bool result = false;
		try
		{
			IPAddress iPAddress = Dns.GetHostAddresses(PCName)[0];
			IPAddress iPAddress2 = IPAddress.Parse(iPAddress.ToString());
			TcpClient tcpClient = new TcpClient(iPAddress2.AddressFamily);
			IAsyncResult asyncResult = tcpClient.BeginConnect(iPAddress2, 139, null, null);
			bool flag = asyncResult.AsyncWaitHandle.WaitOne(Timeout, exitContext: false);
			if (asyncResult.IsCompleted && flag)
			{
				try
				{
					tcpClient.EndConnect(asyncResult);
				}
				catch
				{
				}
				result = true;
			}
			tcpClient.Close();
			return result;
		}
		catch
		{
			return result;
		}
	}

	public static void Delay(double ms)
	{
		DateTime now = DateTime.Now;
		while (DateTime.Now.Subtract(now).TotalMilliseconds < ms)
		{
			Application.DoEvents();
		}
	}

	public static void Delay(double ms, ref string variable)
	{
		DateTime now = DateTime.Now;
		string text = variable;
		while (DateTime.Now.Subtract(now).TotalMilliseconds < ms && variable == text)
		{
			Application.DoEvents();
		}
	}

	public static void Delay(double ms, ref bool variable)
	{
		DateTime now = DateTime.Now;
		while (DateTime.Now.Subtract(now).TotalMilliseconds < ms && !variable)
		{
			Application.DoEvents();
		}
	}
}
