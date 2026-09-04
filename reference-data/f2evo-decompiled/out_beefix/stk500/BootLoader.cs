using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ElectronikSistem;
using ElectronikSistem.WebServiceUpdateFirmWare;
using UpdateFirmware;

namespace stk500;

public class BootLoader : IDisposable
{
	public delegate void EventHandlerResponse(MESSAGE_CMD Request, byte type);

	public delegate void EventHandlerStartDownLoad(byte type, int Max);

	public delegate void EventHandlerEndDownLoad(byte result);

	public delegate void EventHandlerBoardReceived(string Version);

	public delegate void EventHandlerError(string err);

	public delegate void DelegateHandleFrame(List<byte> buffer);

	public static sbyte COMMElectronic = -1;

	public static sbyte COMMHydraulic = -1;

	public static sbyte COMMWASHINGBOARD = -1;

	public static SerialPort[] SerialPortCOM;

	private IntPtr handle;

	private Component component = new Component();

	private bool disposed = false;

	private bool DownLoadCompleted;

	private UpdateFirmWare WebService;

	public char[] VersionRequest = "\u0002ver\0".ToCharArray();

	public bool Protect;

	public bool Verify;

	public bool User;

	public bool IsProgramming = false;

	public bool Inverter = false;

	public bool UpdateLicense = false;

	public bool IsBEEFIX = false;

	public byte Result;

	public byte LockBit;

	public byte Len;

	public byte Error = 0;

	public byte ROW_LEN = 64;

	public int Address = 0;

	public int SpeedDevice;

	public ushort NReceive = 0;

	public string CurrentVersion;

	public string BoardName;

	public string PartNumber;

	public string Firmware;

	public string SerialNumberProgram;

	public string SerialNumberMicro;

	public string Company;

	public string UserName;

	public string Code;

	public string VersionFirmware = "firmware";

	public string ErrorMessage;

	public MESSAGE_CMD obj = null;

	public List<AVR_HEX> hex = new List<AVR_HEX>();

	public List<string> Firmwares;

	public List<byte> Buffer = new List<byte>();

	public List<string> ErrorList = new List<string>();

	public Queue<MESSAGE_CMD> WriteCMD = new Queue<MESSAGE_CMD>();

	public Queue<MESSAGE_CMD> VerifyCMD = new Queue<MESSAGE_CMD>();

	public SerialPort COM = new SerialPort();

	public Timer TimeOUT = new Timer();

	public Timer TimeService = new Timer();

	public DelegateHandleFrame DataReceived;

	private List<string> Software;

	public virtual event EventHandlerStartDownLoad StartDownLoad;

	public virtual event EventHandlerResponse Response;

	public virtual event EventHandlerBoardReceived BoardReceived;

	public virtual event EventHandlerEndDownLoad EndDownLoad;

	public virtual event EventHandlerError HandlerError;

	[DllImport("Kernel32")]
	private static extern bool CloseHandle(IntPtr handle);

	public BootLoader()
	{
		COM.BaudRate = 115200;
		COM.PortName = "COM100";
		COM.ReceivedBytesThreshold = 1;
		TimeOUT.Interval = 150;
		TimeService.Interval = 2000;
		DataReceived = COM_DataReceived;
		WebService = new UpdateFirmWare();
		WebService.Url = MainForm.URL + "UpdateFirmWare/UpdateFirmWare.asmx";
		Software = new List<string>();
		if (Application.ExecutablePath.IndexOf("BEEFIX.exe") > -1)
		{
			IsBEEFIX = true;
		}
		if (!IsBEEFIX)
		{
			Software.Add("C:\\Program Files\\GRMtronics\\SC F2-EVO");
			Software.Add("C:\\Program Files\\GRMtronics\\SC F2-EVO HJ");
		}
		else
		{
			Software.Add("C:\\Program Files\\BEEFIX\\BEEFIX-Repair");
			Software.Add("C:\\Program Files\\BEEFIX\\NG25MT TOOL BEEFIX");
		}
	}

	~BootLoader()
	{
		Dispose(disposing: false);
	}

	public void Dispose()
	{
		COM.Dispose();
		TimeOUT.Dispose();
		COM = null;
		TimeOUT = null;
		Dispose(disposing: true);
		GC.SuppressFinalize(this);
	}

	private void Dispose(bool disposing)
	{
		if (!disposed)
		{
			if (disposing)
			{
				component.Dispose();
			}
			CloseHandle(handle);
			handle = IntPtr.Zero;
			disposed = true;
		}
	}

	protected bool CheckData(MemoryStream Firmware)
	{
		StreamReader streamReader = new StreamReader(Firmware);
		List<string> list = new List<string>();
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			list.Add(streamReader.ReadLine());
		}
		if (list.Count == 0)
		{
			return false;
		}
		return list[list.Count - 1] == ":00000001FF";
	}

	private void SetLicense()
	{
		string[] array = new string[7];
		if (UserName == null || Code == null)
		{
			return;
		}
		foreach (string item in Software)
		{
			string path = item + "\\Config.txt";
			if (!Directory.Exists(item))
			{
				continue;
			}
			Prmission.DirectorySetRule(item);
			if (!File.Exists(path))
			{
				if (!IsBEEFIX)
				{
					array[1] = "www.testbenches.eu";
					array[2] = "/TestABS/TestABS.asmx";
				}
				else
				{
					array[1] = "service.beefixtech.com";
					array[2] = "/BEEFIX/BEEFIX.asmx";
				}
				array[3] = "80";
			}
			array[0] = UserName;
			if (!IsBEEFIX)
			{
				array[4] = "ftp://ftp.testbenches.eu/testbenches.eu/Backup/" + UserName;
			}
			else
			{
				array[4] = "ftp://service.beefixtech.com/service.beefixtech.com/Backup/" + UserName;
			}
			array[5] = Code;
			array[6] = Company;
			File.WriteAllLines(path, array);
		}
		if (!IsBEEFIX)
		{
			File.WriteAllLines("Config.txt", new string[2] { UserName, Code });
		}
	}

	protected async void LoadHexAsync(string Firmware)
	{
		DownLoadCompleted = await Task.Run(delegate
		{
			MemoryStream memoryStream = new MemoryStream();
			FormConfigFirmware formConfigFirmware = null;
			ushort num = 1;
			int length = Firmware.IndexOf("/");
			switch (Firmware.Substring(0, length))
			{
			case "TEST ABS":
				if (!IsBEEFIX && File.Exists("C:\\Program Files\\GRMtronics\\Test Bench ABS\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\GRMtronics\\Test Bench ABS\\Config.txt", 1);
				}
				num = 2;
				break;
			case "Test Centralina":
				if (!IsBEEFIX && File.Exists("C:\\Program Files\\GRMtronics\\Test Centralina\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\GRMtronics\\Test Centralina\\Config.txt", 1);
				}
				num = 4;
				break;
			case "WASHING":
			case "Hydraulics":
			case "Electronics":
				if (!IsBEEFIX && !User && File.Exists("C:\\Program Files\\GRMtronics\\SC F2-EVO\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\GRMtronics\\SC F2-EVO\\Config.txt", 2);
					num = 32;
				}
				else if (!IsBEEFIX && !User && File.Exists("C:\\Program Files\\GRMtronics\\SC F2-EVO HJ\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\GRMtronics\\SC F2-EVO HJ\\Config.txt", 2);
					num = 32;
				}
				else if (IsBEEFIX && !User && File.Exists("C:\\Program Files\\BEEFIX\\BEEFIX-Repair\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\BEEFIX\\BEEFIX-Repair\\Config.txt", 2);
					num = 64;
				}
				break;
			case "NG25MT-BEEFIX":
				if (IsBEEFIX && !User && File.Exists("C:\\Program Files\\BEEFIX\\NG25MT TOOL BEEFIX\\Config.txt"))
				{
					formConfigFirmware = new FormConfigFirmware("C:\\Program Files\\BEEFIX\\NG25MT TOOL BEEFIX\\Config.txt", 0);
					num = 2048;
				}
				break;
			}
			if (formConfigFirmware == null)
			{
				if (!File.Exists("Config.txt"))
				{
					ErrorMessage = "Config not found.";
					return false;
				}
				byte type = 0;
				if (IsBEEFIX)
				{
					type = 2;
				}
				formConfigFirmware = new FormConfigFirmware("Config.txt", type);
			}
			MainForm.DataBase.Command.CommandText = "SELECT IIf(IsNull(SerialNumber), '', SerialNumber) FROM Clients WHERE UserName = '" + formConfigFirmware.UserName.Text + "' AND (((Mask\\(2^" + Math.Log((int)num, 2.0) + ")) mod 2) = 1)";
			object obj = MainForm.DataBase.ExecuteScalar();
			int num2 = (int)FTP.GetSize(MainForm.Domain + "firmware/" + Firmware, MainForm.Login, MainForm.Password);
			byte[] array = null;
			if (User)
			{
				obj = "";
			}
			if (obj == "")
			{
				array = WebService.UploadFirmWare(formConfigFirmware.UserName.Text, Firmware, formConfigFirmware.License.Text);
			}
			else
			{
				if (obj == null)
				{
					ErrorMessage = "License not generated.";
					return false;
				}
				bool flag = !COM.IsOpen;
				if (flag)
				{
					COM.Open();
				}
				GetSerialNumber(out var _);
				COM.DiscardInBuffer();
				if (flag)
				{
					COM.Close();
				}
				array = WebService.UploadFirmWareNew(formConfigFirmware.UserName.Text, SerialNumberMicro, Firmware, formConfigFirmware.License.Text);
			}
			formConfigFirmware.Close();
			formConfigFirmware.Dispose();
			formConfigFirmware = null;
			if (array.Length != 16)
			{
				memoryStream.Write(array, 0, array.Length);
				if (num2 != array.Length || num2 < 100 || !CheckData(memoryStream))
				{
					ErrorMessage = "Firmware not downloaded correctly.\r\nRetry the operation!!!";
					return false;
				}
				LoadHex(memoryStream);
				if (UpdateLicense)
				{
					SetLicense();
				}
				return true;
			}
			ErrorMessage = Encoding.UTF8.GetString(array);
			return false;
		});
	}

	protected void LoadHex(MemoryStream Hexfile)
	{
		int num = 0;
		List<byte> list = new List<byte>();
		List<byte> list2 = new List<byte>();
		List<AVR_HEX> list3 = new List<AVR_HEX>();
		StreamReader streamReader = new StreamReader(Hexfile);
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			string text = streamReader.ReadLine();
			if (!(text == ""))
			{
				list.Clear();
				for (int i = 1; i < text.Length; i += 2)
				{
					byte item = byte.Parse(text.Substring(i, 2), NumberStyles.HexNumber);
					list.Add(item);
				}
				AVR_HEX item2 = new AVR_HEX(list.ToArray());
				list3.Add(item2);
			}
		}
		num = list3[0].address;
		byte type = list3[0].type;
		foreach (AVR_HEX item3 in list3)
		{
			if (item3.type == 1)
			{
				break;
			}
			if (item3.type == type)
			{
				list2.AddRange(item3.memory);
				num += item3.len;
			}
			else
			{
				num = num;
			}
		}
		hex.Clear();
		num = list3[0].address;
		byte[] array = new byte[ROW_LEN];
		for (; num < list2.Count; num += ROW_LEN)
		{
			byte b = ROW_LEN;
			if (list2.Count - num < ROW_LEN)
			{
				b = (byte)(list2.Count - num);
			}
			System.Buffer.BlockCopy(list2.ToArray(), num, array, 0, b);
			AVR_HEX item2 = new AVR_HEX(num, array, type, b);
			hex.Add(item2);
		}
		AVR_HEX aVR_HEX = hex[hex.Count - 1];
	}

	protected bool LoadFileHex(string vers)
	{
		int num = -1;
		int num2 = -1;
		try
		{
			string text = vers.ToLower();
			if (text.IndexOf(".hex") == -1)
			{
				text += ".hex";
			}
			num2 = Firmwares.IndexOf(text);
			num = Firmwares.IndexOf(CurrentVersion);
			if (!Verify)
			{
				if (num >= 0)
				{
					if (num2 > num && MessageBox.Show("Update to the new version?", "Information", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button2) == DialogResult.No)
					{
						return false;
					}
					if (num2 < num && MessageBox.Show("Go back to the previous version?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No)
					{
						return false;
					}
				}
				if (num2 == -1 && num == -1)
				{
					num2 = Firmwares.Count - 1;
					text = Firmwares[num2];
					if (CurrentVersion != "firmware:.hex" && MessageBox.Show("Version not found.\r\nDo you want to update with the [" + text + "] version?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No)
					{
						return false;
					}
				}
			}
			ErrorMessage = "";
			Firmware = Firmwares[num2];
			LoadHexAsync(PartNumber + "/" + Firmware);
			DateTime now = DateTime.Now;
			Sistem.Delay(5000.0, ref DownLoadCompleted);
			if (!DownLoadCompleted)
			{
				if (ErrorMessage == "")
				{
					ErrorMessage = "Download timeout!!!";
				}
				throw new Exception(ErrorMessage);
			}
			return DownLoadCompleted;
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			Verify = true;
			Application.Exit();
			return false;
		}
	}

	public void COM_DataReceived(object sender, SerialDataReceivedEventArgs e)
	{
		Buffer.AddRange(COM.Encoding.GetBytes(COM.ReadExisting()));
		DataReceived(Buffer);
	}

	private void COM_DataReceived(List<byte> buffer)
	{
		if (!(VersionFirmware != "firmware"))
		{
			string board = GetBoard(buffer);
			if (board != null)
			{
				this.BoardReceived(board);
			}
		}
	}

	protected string GetBoard(List<byte> buffer)
	{
		try
		{
			string text = Encoding.GetEncoding("ISO-8859-1").GetString(buffer.ToArray());
			if (WriteCMD.Count == 0 && VerifyCMD.Count == 0)
			{
				List<string> list = COM.Encoding.GetString(buffer.ToArray()).Split("\n"[0]).ToList();
				for (int i = 1; i < list.Count; i++)
				{
					if (list[i - 1].Length >= 8 && list[i].IndexOf("ver") == 0 && list[i].IndexOf(".") >= 4)
					{
						string[] array = list[i - 1].Replace("\r", "").Replace("\0", "").Split(' ');
						PartNumber = array[array.Length - 1];
						if (array.Length - 2 > -1 && array[array.Length - 2].ToUpper() == "TEST" && (PartNumber == "ABS" || PartNumber == "Centralina"))
						{
							PartNumber = array[array.Length - 2] + " " + PartNumber;
						}
						VersionFirmware = "Firmware-" + list[i].Split("."[0])[0];
						return "Firmware-" + list[i].Substring(0, 8);
					}
				}
			}
		}
		catch
		{
			return null;
		}
		return null;
	}

	public virtual bool UploadStart(string vers)
	{
		return false;
	}

	public string GetVer()
	{
		try
		{
			if (!COM.IsOpen)
			{
				COM.DtrEnable = false;
				COM.RtsEnable = false;
				COM.Open();
			}
			COM.DiscardInBuffer();
			COM.DiscardOutBuffer();
			COM.Write(VersionRequest, 0, VersionRequest.Length);
			DateTime now = DateTime.Now;
			while (COM.IsOpen && PartNumber == null && DateTime.Now.Subtract(now).TotalSeconds < 1.5)
			{
				Application.DoEvents();
			}
			return "Firmware:";
		}
		catch (Exception)
		{
			MessageBox.Show("Connect the board with the USB cable.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			if (User && MessageBox.Show("Do you want to program the ABS code?", "Information", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
			{
				new CodeABS().ShowDialog();
			}
			Application.Exit();
			return "";
		}
	}

	protected void Time_OUT()
	{
		TimeOUT.Enabled = false;
		COM.Close();
		if (LockBit == 247 && Protect)
		{
			LockBit = byte.MaxValue;
			if (Verify)
			{
				MessageBox.Show("Verification not available.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
		}
	}

	public bool GetSerialNumber(out string reset)
	{
		SerialPort serialPort = null;
		bool flag = false;
		string text = "";
		reset = null;
		string text2 = ((BoardName == null) ? PartNumber : BoardName);
		switch (text2)
		{
		case "Hydraulics":
			reset = "H-RESET";
			text = "H-SERIALNUMBER";
			serialPort = ((COMMHydraulic <= -1 || !(SerialPortCOM[COMMHydraulic].PortName != COM.PortName)) ? COM : SerialPortCOM[COMMHydraulic]);
			break;
		case "WASHING":
			reset = "W-RESET";
			text = "W-SERIALNUMBER";
			serialPort = ((COMMWASHINGBOARD <= -1 || !(SerialPortCOM[COMMWASHINGBOARD].PortName != COM.PortName)) ? COM : SerialPortCOM[COMMWASHINGBOARD]);
			break;
		case "Electronics":
			reset = "E-RESET";
			text = "E-SERIALNUMBER";
			serialPort = ((COMMElectronic <= -1 || !(SerialPortCOM[COMMElectronic].PortName != COM.PortName)) ? COM : SerialPortCOM[COMMElectronic]);
			break;
		default:
			text = "SERIALNUMBER";
			serialPort = COM;
			break;
		}
		flag = BoardName != null;
		SerialNumberMicro = "";
		if (flag || (text2 != null && text2 != ""))
		{
			if (!serialPort.IsOpen)
			{
				serialPort.Open();
			}
			for (byte b = 0; b < 3; b++)
			{
				serialPort.WriteLine(text);
				Sistem.Delay(200.0);
				if (SerialNumberMicro != "")
				{
					break;
				}
			}
			if (serialPort.PortName != COM.PortName)
			{
				serialPort.Close();
			}
		}
		return flag;
	}
}
