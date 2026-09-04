using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ElectronikSistem;
using stk500;

namespace UpdateFirmware;

public class MainForm : Form
{
	public delegate void DelegateHandleFrame(sbyte n);

	public delegate void EventHandlerBoardReceived(string Version);

	private delegate void EventHandlerStartDownLoad(byte type, int Max);

	private delegate void EventHandlerResponse(MESSAGE_CMD req, byte type);

	private delegate void EventHandlerEndDownLoad(byte result);

	private delegate void EventHandlerError(string err);

	public static string URL = "http://localhost/";

	public static string Domain = "ftp://localhost/";

	public static string Login = "Arthur";

	public static string Password = "artu'68";

	public static string UserName;

	public static string License;

	private sbyte PortCOMM = -1;

	public static Queue<char>[] BufferRx;

	public static string[] DataUart;

	public static DataService DataBase;

	public static MemoryStream HostPC;

	public static CultureInfo Culture = new CultureInfo("it-IT");

	private List<string> BoardList;

	private ushort Mask;

	private string LastMessage;

	private Dictionary<sbyte, string> SerialNumbers;

	private byte ErrorBoard;

	private WhiteForm Waite;

	private BootLoader BOOT;

	private BootLoader Board;

	public EventHandlerBoardReceived DataReceived;

	private bool UpdateAvaiable = false;

	private bool User = false;

	private bool IsBEEFIX = false;

	private IContainer components = null;

	private Button Upload;

	private ProgressBar WriteBar;

	private Label Write;

	private Label label1;

	private ProgressBar VerifyBar;

	private CheckBox Verify;

	private Label Version;

	private CheckBox Protect;

	private Button GetSerialNumber;

	private Button btnSerialNumber;

	private Label Model;

	private new Button Select;

	private Button CodeABS;

	private Button Config;

	private Label txtSerialNumber;

	private CheckBox InverterReset;

	private Timer ProcessClose;

	public MainForm()
	{
		InitializeComponent();
		if (Application.ExecutablePath.IndexOf("BEEFIX.exe") > -1)
		{
			IsBEEFIX = true;
		}
		LoadParameters();
		Config_Click(null, null);
		User = SystemInformation.ComputerName == "PCARTURO" || SystemInformation.ComputerName == "WIN-RAMK9RDDQMO";
		User |= Sistem.GetCredential(Domain, Login, Password);
		InverterReset.Visible = User;
		BoardList = new List<string>();
		List<string> portCom = Sistem.GetPortCom();
		BootLoader.SerialPortCOM = new SerialPort[portCom.Count];
		BufferRx = new Queue<char>[portCom.Count];
		DataUart = new string[portCom.Count];
		for (int i = 0; i < portCom.Count; i++)
		{
			BufferRx[i] = new Queue<char>();
			BootLoader.SerialPortCOM[i] = new SerialPort();
			BootLoader.SerialPortCOM[i].BaudRate = 115200;
			BootLoader.SerialPortCOM[i].ReceivedBytesThreshold = 1;
			BootLoader.SerialPortCOM[i].Encoding = Encoding.GetEncoding("ISO-8859-1");
			BootLoader.SerialPortCOM[i].ReceivedBytesThreshold = 1;
			BootLoader.SerialPortCOM[i].Handshake = Handshake.None;
			BootLoader.SerialPortCOM[i].DataReceived += COM_DataReceived;
			string[] array = portCom[i].Replace("USB", "").Split(" "[0]);
			BootLoader.SerialPortCOM[i].PortName = array[0];
		}
		BOOT = new BootLoader();
		BOOT.COM.DataReceived += BOOT.COM_DataReceived;
		BOOT.BoardReceived += brd_BoardReceived;
		BOOT.IsBEEFIX = IsBEEFIX;
		DataReceived = BoardReceived;
		SerialNumbers = new Dictionary<sbyte, string>();
		if (IsBEEFIX && !User)
		{
			base.Opacity = 0.0;
			Text = "Write Firmware";
			foreach (Control control in base.Controls)
			{
				control.Visible = false;
			}
			WriteBar.Visible = true;
			WriteBar.Top = 2;
			base.Height = WriteBar.Height + 44;
		}
		if (IsBEEFIX)
		{
			base.Icon = null;
		}
	}

	public async Task<bool> CheckUpdateAsync(string path, string PathdataBase)
	{
		return await Task.Run(delegate
		{
			bool result = false;
			List<string> list = new List<string>();
			if (!Directory.Exists(path) || !Directory.Exists(PathdataBase))
			{
				return false;
			}
			if (File.Exists(path + "Update.txt"))
			{
				list.AddRange(File.ReadAllLines(path + "Update.txt"));
			}
			if (File.Exists(PathdataBase + "\\Query.txt"))
			{
				list.AddRange(File.ReadAllLines(PathdataBase + "\\Query.txt"));
			}
			string text = Domain + "Software/Update Firmware/";
			if (User)
			{
				text = Domain + "Software/Update Firmware%20Sviluppo/";
			}
			try
			{
				List<string> list2 = FTP.List(text, Login, Password);
				foreach (string item in list2)
				{
					DateTime lastWriteTime = FTP.GetLastWriteTime(text + item, Login, Password);
					if (!Contains(list, item, out var ticks))
					{
						result = true;
						if (item == "Update.exe")
						{
							FTP.Download(path + item, text + item, Login, Password, null, null);
						}
					}
					else
					{
						DateTime value = DateTime.FromBinary(ticks);
						if (lastWriteTime.Subtract(value).TotalSeconds > 0.5)
						{
							result = true;
							string executablePath = Application.ExecutablePath;
							int startIndex = executablePath.LastIndexOf("\\") + 1;
							executablePath = executablePath.Substring(startIndex);
							if (item == executablePath)
							{
								string value2 = lastWriteTime.ToString(lastWriteTime.Year - 2024 + ".yy.MMdd");
								Sistem.ChangeVersionApplicationInstalled("Update firmware", value2);
							}
							if (item == "Update.exe")
							{
								FTP.Download(path + item, text + item, Login, Password, null, null);
							}
						}
					}
					Application.DoEvents();
				}
			}
			catch
			{
			}
			return result;
		});
	}

	private static bool Contains(List<string> Files, string file, out long ticks)
	{
		foreach (string File in Files)
		{
			string text = File.Split(';')[0];
			if (text.IndexOf(file) > -1)
			{
				ticks = long.Parse(File.Split(';')[1]);
				return true;
			}
		}
		ticks = -1L;
		return false;
	}

	private async void CheckUpdate()
	{
		string path = ".\\";
		string[] cmd = Environment.CommandLine.Replace(" -", "ç").Split('ç');
		if (cmd.Length > 1)
		{
			path = cmd[1];
		}
		string NameProject = "GRMtronics";
		string NameFolder = "Update Firmware";
		string PathDataBase = path;
		if (User)
		{
			NameFolder += " Sviluppo";
		}
		UpdateAvaiable = await CheckUpdateAsync(path, PathDataBase);
		string arguments = $"-{NameFolder} -{NameProject} -{PathDataBase}";
		if (UpdateAvaiable)
		{
			if (path != "")
			{
				Directory.SetCurrentDirectory(path);
			}
			FileInfo file = new FileInfo("Update.exe");
			while (Prmission.IsFileLocked(file))
			{
				Application.DoEvents();
			}
			Process.Start(new ProcessStartInfo
			{
				UseShellExecute = true,
				WorkingDirectory = Environment.CurrentDirectory,
				FileName = "Update.exe",
				Arguments = arguments,
				Verb = "runas"
			});
			Application.Exit();
		}
	}

	private void LoadParameters()
	{
		string[] array = File.ReadAllLines("Config.dll");
		UpdateFirmware.License.DecoderField(array[0], out var fields);
		URL = fields.User;
		UpdateFirmware.License.DecoderField(array[1], out fields);
		Domain = fields.User;
		UpdateFirmware.License.DecoderField(array[2], out fields);
		Login = fields.User;
		UpdateFirmware.License.DecoderField(array[3], out fields);
		Password = fields.User;
	}

	private void Select_Click(object sender, EventArgs e)
	{
		Version.Text = "Firmware:";
		Board.BoardName = null;
		Board.PartNumber = null;
		if (PortCOMM > -1)
		{
			Board.COM.PortName = "COM100";
		}
		Board.VersionFirmware = "firmware";
		if (BOOT.COM.IsOpen)
		{
			BOOT.COM.Close();
		}
		BOOT.PartNumber = null;
		BOOT.BoardName = null;
		if (PortCOMM > -1)
		{
			BOOT.COM.PortName = "COM100";
		}
		BOOT.VersionFirmware = "firmware";
		Application.DoEvents();
		PortCOMM = -1;
		Boarb(null);
	}

	private string GetProtocol(MemoryStream Boardfile, string pn)
	{
		string result = null;
		StreamReader streamReader = new StreamReader(Boardfile);
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			string text = streamReader.ReadLine();
			if (text.IndexOf(pn) > -1)
			{
				result = text.Split(";"[0])[1];
			}
		}
		return result;
	}

	public string DoSomeWork(Uri uri, int timeOut = 3000)
	{
		string output = null;
		bool cancelledOrError = false;
		using (WebClient webClient = new WebClient())
		{
			webClient.DownloadStringCompleted += delegate(object sender, DownloadStringCompletedEventArgs e)
			{
				if (e.Error != null || e.Cancelled)
				{
					cancelledOrError = true;
				}
				else
				{
					output = e.Result;
				}
			};
			webClient.DownloadStringAsync(uri);
			DateTime now = DateTime.Now;
			while (output == null && !cancelledOrError && DateTime.Now.Subtract(now).TotalMilliseconds < (double)timeOut)
			{
				Application.DoEvents();
			}
		}
		return output;
	}

	public bool CheckForInternetConnection()
	{
		Waite = new WhiteForm();
		Waite.Show();
		Waite.Message.Left = 10;
		Waite.Message.Text = "Check connection internet.";
		Task<string> task = Task.Factory.StartNew(() => DoSomeWork(new Uri("http://www.google.com")));
		while (task.Status == TaskStatus.Running || task.Status == TaskStatus.WaitingToRun || task.Status == TaskStatus.WaitingForChildrenToComplete)
		{
			Application.DoEvents();
		}
		Waite.Close();
		Waite.Dispose();
		Waite = null;
		return task.Result != null;
	}

	private async Task<bool> LoginAsync(DataService adapter)
	{
		return await Task.Run(delegate
		{
			string text = "";
			License.FIELDS fields;
			License.FIELDS fields2;
			if (!IsBEEFIX)
			{
				UpdateFirmware.License.DecoderField("6501117101474806275778210111213201117101109150909091012112", out fields);
				UpdateFirmware.License.DecoderField("6590909101211201032433877757271666076201117101109150", out fields2);
				text = "65909141720121411102730303134492011171011091509090";
			}
			else
			{
				UpdateFirmware.License.DecoderField("6501214111027303031344911100909201117101109150909090914172", out fields);
				UpdateFirmware.License.DecoderField("65909141720121411102730303134492011171011091509090", out fields2);
				text = "659090910121220121110273030313449201013101109110";
			}
			return adapter.LogIn(fields2.User, fields.User, "Hydraulics", text);
		});
	}

	private async void MainForm_Load(object sender, EventArgs e)
	{
		bool request = false;
		string IDBoard = "";
		string displayVersion = "";
		string debug = "";
		string[] cmd = Environment.CommandLine.Split('-');
		if (!CheckForInternetConnection())
		{
			MessageBox.Show("Error: Check your internet connection.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			if (!IsBEEFIX)
			{
				Application.ExitThread();
				Application.Exit();
			}
			else
			{
				ProcessClose.Enabled = true;
			}
			return;
		}
		string db = "GestioneLicenze";
		if (IsBEEFIX)
		{
			db = "BEEFIX Licenze";
		}
		DataBase = new DataService(URL + "ServerDb/ServerDb.asmx", "License", db);
		bool _value = await LoginAsync(DataBase);
		btnSerialNumber.Enabled = _value;
		if (!IsBEEFIX && !Debugger.IsAttached)
		{
			CheckUpdate();
		}
		if (cmd.Length == 4)
		{
			request = true;
			BOOT.PartNumber = cmd[1].Trim();
			BOOT.VersionFirmware = "Firmware-" + cmd[2].Trim();
			BOOT.COM.PortName = cmd[3].Trim();
		}
		try
		{
			if (!IsBEEFIX)
			{
				if (Sistem.IsApplicationInstalled("Update firmware", out displayVersion))
				{
					Text = "Update firmware ABS v" + displayVersion;
				}
				else
				{
					Text = "Update firmware ABS vx.xx.xxxx";
				}
			}
			BoardList.Add("NONE");
			Waite = new WhiteForm();
			Waite.Show();
			for (byte n = 0; n < BootLoader.SerialPortCOM.Length; n++)
			{
				try
				{
					if (!BootLoader.SerialPortCOM[n].IsOpen)
					{
						BootLoader.SerialPortCOM[n].Open();
						BootLoader.SerialPortCOM[n].DtrEnable = false;
						BootLoader.SerialPortCOM[n].RtsEnable = false;
					}
					if (BootLoader.COMMHydraulic == -1)
					{
						for (byte i = 0; i < 5; i++)
						{
							BootLoader.SerialPortCOM[n].WriteLine("Hydraulics");
							Sistem.Delay(400.0);
							if (BootLoader.COMMHydraulic != -1)
							{
								break;
							}
						}
					}
					if (BootLoader.COMMElectronic == -1)
					{
						for (byte i2 = 0; i2 < 5; i2++)
						{
							BootLoader.SerialPortCOM[n].WriteLine("Electronics");
							Sistem.Delay(400.0);
							if (BootLoader.COMMElectronic != -1)
							{
								break;
							}
						}
					}
					if (BootLoader.COMMWASHINGBOARD == -1)
					{
						for (byte i3 = 0; i3 < 5; i3++)
						{
							BootLoader.SerialPortCOM[n].WriteLine("WASHING");
							Sistem.Delay(400.0);
							if (BootLoader.COMMWASHINGBOARD != -1)
							{
								break;
							}
						}
					}
					BootLoader.SerialPortCOM[n].DiscardOutBuffer();
					BootLoader.SerialPortCOM[n].DiscardInBuffer();
					BootLoader.SerialPortCOM[n].Close();
				}
				catch (Exception)
				{
				}
			}
			Sistem.Delay(600.0);
			for (byte i4 = 0; i4 < BootLoader.SerialPortCOM.Length; i4++)
			{
				BootLoader.SerialPortCOM[i4].DataReceived -= COM_DataReceived;
				if (BootLoader.SerialPortCOM[i4].IsOpen)
				{
					BootLoader.SerialPortCOM[i4].Close();
				}
			}
			Waite.Dispose();
			Waite.Close();
			Waite = null;
			if (BoardList.Count > 1)
			{
				PortComm selectcomm = new PortComm(BoardList);
				selectcomm.Text = "Select Board";
				selectcomm.ShowDialog();
				string[] value = selectcomm.COMM.Replace("USB", "").Split(" "[0]);
				switch (value[0])
				{
				case "Electronics":
					PortCOMM = BootLoader.COMMElectronic;
					BOOT.VersionRequest = "Electronics\r\n".ToCharArray();
					break;
				case "Hydraulics":
					PortCOMM = BootLoader.COMMHydraulic;
					BOOT.VersionRequest = "Hydraulics\r\n".ToCharArray();
					break;
				case "WASHING":
					PortCOMM = BootLoader.COMMWASHINGBOARD;
					BOOT.VersionRequest = "WASHING\r\n".ToCharArray();
					break;
				}
				if (PortCOMM > -1)
				{
					BOOT.COM.PortName = BootLoader.SerialPortCOM[PortCOMM].PortName;
					BOOT.BoardName = value[0];
				}
			}
			Boarb(sender);
		}
		catch (Exception)
		{
			MessageBox.Show("Error: an error occurred.\r\n\r\nLocation [" + debug + "]\r\n\r\nBoard [" + IDBoard + "]\r\n\r\n\r\nShow this screen to the manufacturer.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			Application.ExitThread();
			Application.Exit();
			return;
		}
		if (request)
		{
			Version.Text = "firmware-" + cmd[2].Trim() + ".000.hex";
			Board.CurrentVersion = "firmware-" + cmd[2].Trim() + ".000.hex";
			Upload.PerformClick();
		}
	}

	public void COM_DataReceived(object sender, SerialDataReceivedEventArgs e)
	{
		sbyte b = 0;
		SerialPort obj = (SerialPort)sender;
		b = 0;
		while (b < BootLoader.SerialPortCOM.Length && !BootLoader.SerialPortCOM[b].Equals(obj))
		{
			b++;
		}
		byte[] bytes = BootLoader.SerialPortCOM[b].Encoding.GetBytes(BootLoader.SerialPortCOM[b].ReadExisting());
		for (int i = 0; i < bytes.Length; i++)
		{
			char item = (char)bytes[i];
			BufferRx[b].Enqueue(item);
		}
		Invoke(new DelegateHandleFrame(Handle_DataReceived), b);
	}

	public void Handle_DataReceived(sbyte n)
	{
		try
		{
			while (BufferRx[n].Count > 0)
			{
				char c = BufferRx[n].Dequeue();
				DataUart[n] += c;
				if (c != '\n')
				{
					continue;
				}
				string text = DataUart[n];
				DataUart[n] = "";
				if (text.IndexOf("Electronics") > -1 || text.IndexOf("Test Centralina") > -1)
				{
					BootLoader.SerialPortCOM[n].WriteLine("ACK Electronics");
					if (!BoardList.Contains("Electronics"))
					{
						BoardList.Add("Electronics");
					}
					BootLoader.COMMElectronic = n;
					BootLoader.SerialPortCOM[n].DiscardInBuffer();
					break;
				}
				if (text.IndexOf("Hydraulics") > -1)
				{
					BootLoader.SerialPortCOM[n].WriteLine("ACK Hydraulics");
					if (!BoardList.Contains("Hydraulics"))
					{
						BoardList.Add("Hydraulics");
					}
					BootLoader.COMMHydraulic = n;
					BootLoader.SerialPortCOM[n].DiscardInBuffer();
					break;
				}
				if (text.IndexOf("WASHING") > -1)
				{
					BootLoader.SerialPortCOM[n].WriteLine("ACK WASHING");
					if (!BoardList.Contains("WASHING"))
					{
						BoardList.Add("WASHING");
					}
					BootLoader.COMMWASHINGBOARD = n;
					BootLoader.SerialPortCOM[n].DiscardInBuffer();
					break;
				}
				if (text.IndexOf("ACK") > -1)
				{
					break;
				}
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	protected bool GetComm(SerialPort COM)
	{
		string text = "";
		if (COM.PortName != "COM100")
		{
			return true;
		}
		try
		{
			text = "GetComm102:";
			List<string> portCom = Sistem.GetPortCom();
			string portName = "";
			string text2 = "Arduino Mega 2560";
			string value = "Arduino Due Programming Port";
			foreach (string item in portCom)
			{
				if (item.IndexOf(text2) > -1 || item.IndexOf(value) > -1)
				{
					portName = item.Replace(text2, "").Split("-"[0])[0].Trim();
				}
			}
			COM.PortName = portName;
		}
		catch
		{
			try
			{
				string[] array = null;
				text = "GetComm120:";
				List<string> portCom2 = Sistem.GetPortCom();
				text = "GetComm123: " + portCom2.Count + ".\r\n\r\n";
				if (portCom2.Count == 1)
				{
					array = portCom2[0].Replace("USB", "").Split(" "[0]);
				}
				else if (portCom2.Count > 1)
				{
					PortComm portComm = new PortComm(portCom2);
					portComm.ShowDialog();
					array = portComm.COMM.Replace("USB", "").Split(" "[0]);
					portComm.Dispose();
					portComm = null;
				}
				if (array != null)
				{
					COM.PortName = array[0];
				}
			}
			catch (Exception ex)
			{
				MessageBox.Show(text + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return false;
			}
		}
		return true;
	}

	protected void Boarb(object sender)
	{
		bool flag = false;
		string text = null;
		string text2 = "";
		string text3 = "";
		string text4 = "";
		if (GetComm(BOOT.COM))
		{
			text4 = "Get com port.";
			Protect.Visible = User;
			BOOT.User = User;
			if (!Protect.Visible)
			{
				Upload.Left = (base.Width - Upload.Width) / 3;
				Config.Left = (base.Width - Config.Width) * 2 / 3;
			}
			Verify.Visible = Protect.Visible;
			btnSerialNumber.Visible = Protect.Visible;
			Select.Visible = Protect.Visible;
			CodeABS.Visible = Protect.Visible;
			GetSerialNumber.Visible = Protect.Visible;
			ErrorBoard = 0;
			while (true)
			{
				text4 = "Get version.";
				if (!flag && sender != null)
				{
					byte b = 0;
					if (PortCOMM == -1)
					{
						Waite = new WhiteForm();
						Waite.Show();
					}
					while (b++ < 10 && Version.Text == "Firmware:")
					{
						if (BOOT.GetVer() == "")
						{
							return;
						}
					}
					if (BOOT.BoardName != null)
					{
						for (byte b2 = 0; b2 < 3; b2++)
						{
							BOOT.COM.WriteLine("ACK " + BOOT.BoardName);
							Sistem.Delay(200.0);
						}
					}
					BOOT.SpeedDevice = BOOT.COM.BaudRate;
					if (PortCOMM == -1)
					{
						Waite.Close();
						Waite.Dispose();
						Waite = null;
					}
					Sistem.Delay(100.0);
					BOOT.COM.Close();
				}
				while (true)
				{
					text4 = "Get part number.";
					text2 = BOOT.PartNumber + "/" + BOOT.VersionFirmware.ToLower() + "*.*";
					Model.Text = "Model:" + BOOT.PartNumber;
					BOOT.VersionRequest = "\u0002ver\0".ToCharArray();
					switch (BOOT.PartNumber)
					{
					case "TEST ABS":
						Mask = 2;
						break;
					case "Test Centralina":
						Mask = 4;
						break;
					case "BEEFIX":
					case "WASHING":
					case "Hydraulics":
					case "Electronics":
						Mask = 96;
						BOOT.VersionRequest = (BOOT.PartNumber + "\r\n").ToCharArray();
						break;
					case "NG25MT-BEEFIX":
						Mask = 2048;
						break;
					default:
						Mask = 0;
						break;
					}
					if (sender != null)
					{
						List<string> list = FTP.List(Domain + "firmware/", Login, Password);
						if (list == null)
						{
							Application.ExitThread();
							Application.Exit();
							return;
						}
						if (BOOT.PartNumber != null && !list.Contains(BOOT.PartNumber))
						{
							break;
						}
					}
					List<string> list2 = FTP.List(Domain + "firmware/" + text2, Login, Password);
					if (list2 == null)
					{
						Application.ExitThread();
						Application.Exit();
						return;
					}
					text = Version.Text + ".hex";
					if (list2.Count > 1)
					{
						FormFirmWare formFirmWare = new FormFirmWare(list2, Version.Text);
						formFirmWare.ShowDialog();
						text = Version.Text + ".hex";
						Version.Text = formFirmWare.FirmWare;
					}
					string text5 = "GRMtronics";
					if (IsBEEFIX)
					{
						text5 = "BEEFIX";
					}
					MemoryStream boardfile = FTP.Download(Domain + "firmware/" + text5 + ".brd", Login, Password);
					DisableEnable(stato: true);
					if (BOOT.PartNumber != null)
					{
						text4 = "Get protocol.";
						string protocol = GetProtocol(boardfile, BOOT.PartNumber);
						string text6 = protocol;
						string text7 = text6;
						if (!(text7 == "stk500_v2"))
						{
							if (text7 == "stk500_v1")
							{
								Board = new stk500.stk500v1(BOOT);
							}
						}
						else
						{
							Board = new stk500.stk500v2(BOOT);
						}
						InverterReset.Enabled = true;
						Board.StartDownLoad += Board_StartDownLoad;
						Board.Response += Board_Response;
						Board.EndDownLoad += Board_EndDownLoad;
						Board.HandlerError += Board_HandlerError;
						Board.BoardReceived += brd_BoardReceived;
						Board.COM.DataReceived += Board_DataReceived;
						Board.Firmwares = list2;
						Board.CurrentVersion = text.ToLower();
					}
					if (list2 == null)
					{
						MessageBox.Show("Error: Check your internet connection.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
						if (!IsBEEFIX)
						{
							Application.Exit();
						}
						else
						{
							ProcessClose.Enabled = true;
						}
					}
					else if (list2.Count == 0 && BOOT.VersionFirmware == "firmware")
					{
						if (Protect.Visible)
						{
							if (MessageBox.Show("Warning: The card is not responding.\r\n\r\nSelect board manually?", "Warning:", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
							{
								Boards boards = new Boards(boardfile);
								if (boards.ShowDialog() == DialogResult.OK)
								{
									BOOT.PartNumber = boards.Model;
									continue;
								}
								if (!IsBEEFIX)
								{
									Application.Exit();
								}
								else
								{
									ProcessClose.Enabled = true;
								}
								boards.Dispose();
								boards = null;
							}
							else
							{
								if (MessageBox.Show("Do you want to program the ABS code?", "Information", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
								{
									new CodeABS().ShowDialog();
								}
								if (!IsBEEFIX)
								{
									Application.Exit();
								}
								else
								{
									ProcessClose.Enabled = true;
								}
							}
						}
						else
						{
							MessageBox.Show("Error: The card is not responding.", "Error:", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
							if (!IsBEEFIX)
							{
								Application.Exit();
							}
							else
							{
								ProcessClose.Enabled = true;
							}
						}
					}
					if (IsBEEFIX)
					{
						base.Opacity = 1.0;
						if (!User)
						{
							Upload_Click(Upload, new EventArgs());
						}
					}
					return;
				}
				BOOT.PartNumber = null;
				Version.Text = "Firmware:";
				BOOT.VersionFirmware = "firmware";
				ErrorBoard++;
				if (ErrorBoard >= 3)
				{
					MessageBox.Show("Error: Comunication.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					Application.ExitThread();
					Application.Exit();
					break;
				}
			}
		}
		else
		{
			MessageBox.Show("Error: Connect the board with the USB cable.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			if (Protect.Visible && MessageBox.Show("Do you want to program the ABS code?", "Information", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
			{
				new CodeABS().ShowDialog();
			}
			if (!IsBEEFIX)
			{
				Application.Exit();
			}
			else
			{
				ProcessClose.Enabled = true;
			}
		}
	}

	private void DisableEnable(bool stato)
	{
		foreach (Control control in base.Controls)
		{
			if (control is Button || control is CheckBox)
			{
				control.Enabled = stato;
			}
			else
			{
				control.Enabled = true;
			}
		}
	}

	private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
	{
		if (Board == null)
		{
			return;
		}
		if (Board.COM.IsOpen)
		{
			Board.COM.DataReceived -= Board_DataReceived;
			Board.COM.DiscardInBuffer();
			Board.COM.DiscardOutBuffer();
			Board.COM.Close();
		}
		Board = null;
		SerialPort[] serialPortCOM = BootLoader.SerialPortCOM;
		foreach (SerialPort serialPort in serialPortCOM)
		{
			if (serialPort.IsOpen)
			{
				serialPort.Close();
			}
		}
		GC.Collect();
		GC.WaitForPendingFinalizers();
	}

	private void Verify_CheckedChanged(object sender, EventArgs e)
	{
		if (Verify.Checked)
		{
			Upload.Text = "Verify";
		}
		else
		{
			Upload.Text = "Upload";
		}
	}

	public void GetVer_Click(object sender, EventArgs e)
	{
		bool flag = !Board.COM.IsOpen;
		if (flag)
		{
			Board.COM.Open();
		}
		Board.GetSerialNumber(out var _);
		txtSerialNumber.Text = Board.SerialNumberMicro;
		Board.COM.DiscardInBuffer();
		if (flag)
		{
			Board.COM.Close();
		}
	}

	private void Upload_Click(object sender, EventArgs e)
	{
		Board.Verify = Verify.Checked;
		Board.Protect = Protect.Checked;
		bool flag = !Board.UploadStart(Version.Text);
		if (!flag)
		{
			Version.Text = "Write firmware.";
		}
		else
		{
			if (Board != null)
			{
				Board.COM.Close();
			}
			if (!Protect.Visible || IsBEEFIX)
			{
				ProcessClose.Enabled = true;
			}
		}
		DisableEnable(flag);
	}

	private void SerialNumber_Click(object sender, EventArgs e)
	{
		FormSerialNumber formSerialNumber = new FormSerialNumber(Mask);
		if (formSerialNumber.ShowDialog() == DialogResult.OK)
		{
			Board.SerialNumberProgram = formSerialNumber.SerialNumber.Text;
			Board.Company = formSerialNumber.CompanyName;
			Board.UserName = formSerialNumber.UserName;
			Board.Code = formSerialNumber.Code;
			Board.UpdateLicense = formSerialNumber.UpdateLicense.Checked;
			btnSerialNumber.ForeColor = Color.OrangeRed;
		}
		else
		{
			Board.SerialNumberProgram = null;
			Board.UserName = null;
			Board.Code = null;
		}
	}

	private void Board_DataReceived(object sender, SerialDataReceivedEventArgs e)
	{
		if (Board == null)
		{
			return;
		}
		Board.Buffer.AddRange(Board.COM.Encoding.GetBytes(Board.COM.ReadExisting()));
		try
		{
			Board.DataReceived(Board.Buffer);
		}
		catch (Exception)
		{
			Board.Buffer.Clear();
		}
	}

	private void brd_BoardReceived(string vers)
	{
		if (base.InvokeRequired)
		{
			Invoke(new EventHandlerBoardReceived(BoardReceived), vers);
		}
		else
		{
			BoardReceived(vers);
		}
	}

	public void BoardReceived(string vers)
	{
		Version.Text = vers;
		Verify.Enabled = true;
	}

	private void Board_StartDownLoad(byte type, int Max)
	{
		Invoke(new EventHandlerStartDownLoad(StartDownLoad), type, Max);
	}

	private void StartDownLoad(byte type, int Max)
	{
		if (type == 0)
		{
			WriteBar.Value = 0;
			WriteBar.Maximum = Max;
		}
		if (type != 1)
		{
			return;
		}
		Version.Text = "Verify firmware.";
		VerifyBar.Value = 0;
		VerifyBar.Maximum = Max;
		if (IsBEEFIX)
		{
			Text = "Verify Firmware";
			if (!User)
			{
				WriteBar.Visible = false;
				VerifyBar.Top = WriteBar.Top;
				VerifyBar.Visible = true;
			}
		}
	}

	private void Board_Response(MESSAGE_CMD req, byte type)
	{
		Invoke(new EventHandlerResponse(Response), req, type);
	}

	private void Response(MESSAGE_CMD req, byte type)
	{
		if (type == 0)
		{
			WriteBar.Value++;
		}
		if (type == 1)
		{
			VerifyBar.Value++;
		}
	}

	private void Board_EndDownLoad(byte result)
	{
		Invoke(new EventHandlerEndDownLoad(EndDownLoad), result);
	}

	private void EndDownLoad(byte result)
	{
		if (result == 0)
		{
			if (LastMessage == null)
			{
				if (Board.UpdateLicense)
				{
					bool flag = false;
					MemoryStream memoryStream = new MemoryStream();
					TextWriter textWriter = new StreamWriter(memoryStream);
					MemoryStream stream = FTP.Download(Domain + "Software/Host-PC.txt", Login, Password);
					StreamReader streamReader = new StreamReader(stream);
					streamReader.BaseStream.Position = 0L;
					string computerName = SystemInformation.ComputerName;
					computerName = computerName.Substring(0, computerName.Length - 1) + " " + computerName.Substring(computerName.Length - 1, 1);
					while (!streamReader.EndOfStream)
					{
						string text = streamReader.ReadLine();
						if (!(text == ""))
						{
							if (text == computerName || text == SystemInformation.ComputerName)
							{
								flag = true;
								text = computerName;
							}
							textWriter.WriteLine(text);
						}
					}
					if (!flag)
					{
						textWriter.WriteLine(computerName);
					}
					textWriter.Flush();
					memoryStream.Seek(0L, SeekOrigin.Begin);
					FTP.Upload(memoryStream, Domain + "Software/Host-PC.txt", Login, Password);
				}
				LastMessage = "Programming done successfully.";
				MessageBox.Show(LastMessage, "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
				string[] array = Environment.CommandLine.Split('-');
				if (array.Length == 4)
				{
					if (!IsBEEFIX)
					{
						Application.Exit();
					}
					else
					{
						ProcessClose.Enabled = true;
					}
				}
			}
			if (!Protect.Visible)
			{
				if (!IsBEEFIX)
				{
					Application.Exit();
				}
				else
				{
					ProcessClose.Enabled = true;
				}
			}
		}
		if (result == 1)
		{
			MessageBox.Show("Programming aborted.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
		DisableEnable(stato: true);
	}

	private void Board_HandlerError(string err)
	{
		Invoke(new EventHandlerError(HandlerError), err);
	}

	private void CodeABS_Click(object sender, EventArgs e)
	{
		new CodeABS().ShowDialog();
	}

	private void Config_Click(object sender, EventArgs e)
	{
		FormConfigFirmware formConfigFirmware = (IsBEEFIX ? new FormConfigFirmware("Config.txt", 2) : new FormConfigFirmware("Config.txt", 0));
		if (sender != null)
		{
			formConfigFirmware.ShowDialog(this);
		}
		UserName = formConfigFirmware.UserName.Text;
		License = formConfigFirmware.License.Text;
		formConfigFirmware.Dispose();
		formConfigFirmware = null;
	}

	private void ProcessClose_Tick(object sender, EventArgs e)
	{
		ProcessClose.Enabled = false;
		Close();
	}

	private void InverterReset_CheckedChanged(object sender, EventArgs e)
	{
		Board.Inverter = InverterReset.Checked;
	}

	private void HandlerError(string err)
	{
		MessageBox.Show(err, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		DisableEnable(stato: true);
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing && components != null)
		{
			components.Dispose();
		}
		base.Dispose(disposing);
	}

	private void InitializeComponent()
	{
		this.components = new System.ComponentModel.Container();
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(UpdateFirmware.MainForm));
		this.Upload = new System.Windows.Forms.Button();
		this.WriteBar = new System.Windows.Forms.ProgressBar();
		this.Write = new System.Windows.Forms.Label();
		this.label1 = new System.Windows.Forms.Label();
		this.VerifyBar = new System.Windows.Forms.ProgressBar();
		this.Verify = new System.Windows.Forms.CheckBox();
		this.Version = new System.Windows.Forms.Label();
		this.Protect = new System.Windows.Forms.CheckBox();
		this.GetSerialNumber = new System.Windows.Forms.Button();
		this.btnSerialNumber = new System.Windows.Forms.Button();
		this.Model = new System.Windows.Forms.Label();
		this.Select = new System.Windows.Forms.Button();
		this.CodeABS = new System.Windows.Forms.Button();
		this.Config = new System.Windows.Forms.Button();
		this.txtSerialNumber = new System.Windows.Forms.Label();
		this.InverterReset = new System.Windows.Forms.CheckBox();
		this.ProcessClose = new System.Windows.Forms.Timer(this.components);
		base.SuspendLayout();
		this.Upload.Enabled = false;
		this.Upload.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Upload.Location = new System.Drawing.Point(110, 167);
		this.Upload.Name = "Upload";
		this.Upload.Size = new System.Drawing.Size(63, 30);
		this.Upload.TabIndex = 0;
		this.Upload.Text = "Upload";
		this.Upload.UseVisualStyleBackColor = true;
		this.Upload.Click += new System.EventHandler(Upload_Click);
		this.WriteBar.Location = new System.Drawing.Point(6, 63);
		this.WriteBar.Name = "WriteBar";
		this.WriteBar.Size = new System.Drawing.Size(463, 23);
		this.WriteBar.TabIndex = 2;
		this.Write.AutoSize = true;
		this.Write.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Write.Location = new System.Drawing.Point(2, 40);
		this.Write.Name = "Write";
		this.Write.Size = new System.Drawing.Size(51, 20);
		this.Write.TabIndex = 3;
		this.Write.Text = "Write";
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(4, 107);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(55, 20);
		this.label1.TabIndex = 5;
		this.label1.Text = "Verify";
		this.VerifyBar.Location = new System.Drawing.Point(6, 130);
		this.VerifyBar.Name = "VerifyBar";
		this.VerifyBar.Size = new System.Drawing.Size(463, 23);
		this.VerifyBar.TabIndex = 4;
		this.Verify.AutoSize = true;
		this.Verify.Enabled = false;
		this.Verify.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Verify.Location = new System.Drawing.Point(100, 106);
		this.Verify.Name = "Verify";
		this.Verify.Size = new System.Drawing.Size(63, 24);
		this.Verify.TabIndex = 6;
		this.Verify.Text = "Only";
		this.Verify.UseVisualStyleBackColor = true;
		this.Verify.CheckedChanged += new System.EventHandler(Verify_CheckedChanged);
		this.Version.AutoSize = true;
		this.Version.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Version.Location = new System.Drawing.Point(282, 9);
		this.Version.Name = "Version";
		this.Version.Size = new System.Drawing.Size(87, 20);
		this.Version.TabIndex = 7;
		this.Version.Text = "Firmware:";
		this.Protect.AutoSize = true;
		this.Protect.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Protect.Location = new System.Drawing.Point(100, 39);
		this.Protect.Name = "Protect";
		this.Protect.Size = new System.Drawing.Size(86, 24);
		this.Protect.TabIndex = 8;
		this.Protect.Text = "Protect";
		this.Protect.UseVisualStyleBackColor = true;
		this.Protect.Visible = false;
		this.GetSerialNumber.Cursor = System.Windows.Forms.Cursors.Hand;
		this.GetSerialNumber.FlatAppearance.BorderSize = 0;
		this.GetSerialNumber.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.GetSerialNumber.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.GetSerialNumber.Location = new System.Drawing.Point(228, 87);
		this.GetSerialNumber.Name = "GetSerialNumber";
		this.GetSerialNumber.Size = new System.Drawing.Size(167, 25);
		this.GetSerialNumber.TabIndex = 9;
		this.GetSerialNumber.Text = "Get Serial Number:";
		this.GetSerialNumber.UseVisualStyleBackColor = true;
		this.GetSerialNumber.Click += new System.EventHandler(GetVer_Click);
		this.btnSerialNumber.Enabled = false;
		this.btnSerialNumber.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.btnSerialNumber.Location = new System.Drawing.Point(330, 167);
		this.btnSerialNumber.Name = "btnSerialNumber";
		this.btnSerialNumber.Size = new System.Drawing.Size(139, 30);
		this.btnSerialNumber.TabIndex = 10;
		this.btnSerialNumber.Text = "Set Serial Number";
		this.btnSerialNumber.UseVisualStyleBackColor = true;
		this.btnSerialNumber.Click += new System.EventHandler(SerialNumber_Click);
		this.Model.AutoSize = true;
		this.Model.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Model.Location = new System.Drawing.Point(4, 9);
		this.Model.Name = "Model";
		this.Model.Size = new System.Drawing.Size(62, 20);
		this.Model.TabIndex = 11;
		this.Model.Text = "Model:";
		this.Select.Enabled = false;
		this.Select.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Select.Location = new System.Drawing.Point(5, 167);
		this.Select.Name = "Select";
		this.Select.Size = new System.Drawing.Size(101, 30);
		this.Select.TabIndex = 12;
		this.Select.Text = "Select Model";
		this.Select.UseVisualStyleBackColor = true;
		this.Select.Click += new System.EventHandler(Select_Click);
		this.CodeABS.Enabled = false;
		this.CodeABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.CodeABS.Location = new System.Drawing.Point(241, 167);
		this.CodeABS.Name = "CodeABS";
		this.CodeABS.Size = new System.Drawing.Size(85, 30);
		this.CodeABS.TabIndex = 13;
		this.CodeABS.Text = "Code ABS";
		this.CodeABS.UseVisualStyleBackColor = true;
		this.CodeABS.Click += new System.EventHandler(CodeABS_Click);
		this.Config.Enabled = false;
		this.Config.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Config.Location = new System.Drawing.Point(177, 167);
		this.Config.Name = "Config";
		this.Config.Size = new System.Drawing.Size(59, 30);
		this.Config.TabIndex = 14;
		this.Config.Text = "Config";
		this.Config.UseVisualStyleBackColor = true;
		this.Config.Click += new System.EventHandler(Config_Click);
		this.txtSerialNumber.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.txtSerialNumber.ForeColor = System.Drawing.Color.Blue;
		this.txtSerialNumber.Location = new System.Drawing.Point(216, 112);
		this.txtSerialNumber.Name = "txtSerialNumber";
		this.txtSerialNumber.Size = new System.Drawing.Size(196, 18);
		this.txtSerialNumber.TabIndex = 15;
		this.txtSerialNumber.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.InverterReset.AutoSize = true;
		this.InverterReset.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.InverterReset.Location = new System.Drawing.Point(286, 39);
		this.InverterReset.Name = "InverterReset";
		this.InverterReset.Size = new System.Drawing.Size(160, 24);
		this.InverterReset.TabIndex = 16;
		this.InverterReset.Text = "Inverti pin Reset";
		this.InverterReset.UseVisualStyleBackColor = true;
		this.InverterReset.Visible = false;
		this.InverterReset.CheckedChanged += new System.EventHandler(InverterReset_CheckedChanged);
		this.ProcessClose.Interval = 500;
		this.ProcessClose.Tick += new System.EventHandler(ProcessClose_Tick);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(473, 201);
		base.Controls.Add(this.InverterReset);
		base.Controls.Add(this.txtSerialNumber);
		base.Controls.Add(this.Config);
		base.Controls.Add(this.CodeABS);
		base.Controls.Add(this.Select);
		base.Controls.Add(this.Model);
		base.Controls.Add(this.btnSerialNumber);
		base.Controls.Add(this.GetSerialNumber);
		base.Controls.Add(this.Protect);
		base.Controls.Add(this.Version);
		base.Controls.Add(this.Verify);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.VerifyBar);
		base.Controls.Add(this.Write);
		base.Controls.Add(this.WriteBar);
		base.Controls.Add(this.Upload);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "MainForm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(MainForm_FormClosing);
		base.Load += new System.EventHandler(MainForm_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
