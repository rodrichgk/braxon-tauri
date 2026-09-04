using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using ElectronikSistem;
using GRMtronics;
using SC_F2_EVO.Properties;

namespace SC_F2_EVO;

public class MainMenuForm : Form
{
	public delegate void DelegateHandleFrame(sbyte n);

	public static string URL = "http://localhost/";

	public static string Domain = "ftp://localhost/";

	public static string Login = "Arthur";

	public static string Password = "artu'68";

	public static bool Uscite;

	public static bool User = false;

	public static string[] DataUart;

	public static string[] Value;

	public static Queue<char>[] BufferRx;

	public static string Operator;

	public static string Versione;

	public static int CardService;

	public static ConnessioneAccess DataBase;

	public static Color bkg;

	public static Color fore;

	public static SerialPort[] COM;

	public static sbyte TestElectronic = -1;

	public static sbyte TestHydraulic = -1;

	public static sbyte WASHINGBOARD = -1;

	public static int ID_Produttore;

	public static int ID_Modello;

	public static string NomeModello;

	public static byte N_STRING = 5;

	public static CultureInfo Culture = new CultureInfo("it-IT");

	public static DateTime Crono;

	public static List<string> ListCOMM;

	private WorkinigProgress FormTest;

	private FormHydraulicBench HydraulicBench;

	private ABS FormABS;

	private Cambi FormCambi;

	private FormSensor SensorForm;

	private FormWashing WashingForm;

	public WhiteForm Waite;

	private byte Attempts = 9;

	private Button[] BTN;

	private bool UpdateAvaiable = false;

	private const int CP_NOCLOSE_BUTTON = 512;

	private IContainer components = null;

	private Button Chiudi;

	private PictureBox Logo;

	private Button ABS;

	private Panel Buttons;

	private Button Sensor;

	private Button HyderaulicBenche;

	private Button AutomaticGearbox;

	private Label ElectronicsBoard;

	private Label Version;

	private Button Dashboard;

	private Button btnConfig;

	private Button ListModels;

	private Button ListCardServices;

	private Label HydraulicsBoard;

	private Label WashingBoard;

	private Button Washing;

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams createParams = base.CreateParams;
			createParams.ClassStyle |= 512;
			return createParams;
		}
	}

	public MainMenuForm()
	{
		InitializeComponent();
		LoadParameters();
		ListCOMM = Sistem.GetPortCom();
		DataUart = new string[ListCOMM.Count];
		BufferRx = new Queue<char>[ListCOMM.Count];
		COM = new SerialPort[ListCOMM.Count];
		Value = new string[ListCOMM.Count];
		for (int i = 0; i < ListCOMM.Count; i++)
		{
			BufferRx[i] = new Queue<char>();
			COM[i] = new SerialPort();
			COM[i].BaudRate = 115200;
			COM[i].PortName = "COM" + (100 + i);
			COM[i].ReceivedBytesThreshold = 1;
			COM[i].Encoding = Encoding.GetEncoding("ISO-8859-1");
			COM[i].DataReceived += COM_DataReceived;
			COM[i].ErrorReceived += COM_ErrorReceived;
		}
		BTN = new Button[5] { ABS, AutomaticGearbox, HyderaulicBenche, Sensor, Washing };
		User = Sistem.GetCredential() || SystemInformation.ComputerName == "PCARTURO";
		if (User)
		{
			base.FormBorderStyle = FormBorderStyle.Fixed3D;
		}
		foreach (Control control in Buttons.Controls)
		{
			control.Visible = User;
		}
	}

	private void LoadParameters()
	{
		string[] array = File.ReadAllLines("Config.dll");
		GRMtronics.License.DecoderField(array[0], out var fields);
		URL = fields.User;
		GRMtronics.License.DecoderField(array[1], out fields);
		Domain = fields.User;
		GRMtronics.License.DecoderField(array[2], out fields);
		Login = fields.User;
		GRMtronics.License.DecoderField(array[3], out fields);
		Password = fields.User;
	}

	public void ResetCom(sbyte n)
	{
		try
		{
			string portName = COM[n].PortName;
			COM[n].DiscardOutBuffer();
			COM[n].DiscardInBuffer();
			COM[n].ErrorReceived -= COM_ErrorReceived;
			COM[n].DataReceived -= COM_DataReceived;
			Sistem.Delay(100.0);
			COM[n].Close();
			COM[n] = null;
			Sistem.Delay(100.0);
			COM[n] = new SerialPort();
			COM[n].BaudRate = 115200;
			COM[n].PortName = portName;
			COM[n].ReceivedBytesThreshold = 1;
			COM[n].Encoding = Encoding.GetEncoding("ISO-8859-1");
			COM[n].DataReceived += COM_DataReceived;
			COM[n].ErrorReceived += COM_ErrorReceived;
			COM[n].Open();
		}
		catch (IOException)
		{
		}
		catch (InvalidOperationException)
		{
		}
		catch (UnauthorizedAccessException)
		{
		}
	}

	protected bool GetComm()
	{
		string text = "";
		try
		{
			string[] array = null;
			text = "GetComm120:";
			text = "GetComm123: " + ListCOMM.Count + ".\r\n\r\n";
			for (int i = 0; i < ListCOMM.Count; i++)
			{
				array = ListCOMM[i].Replace("USB", "").Split(" "[0]);
				COM[i].PortName = array[0];
			}
		}
		catch (Exception)
		{
			return false;
		}
		return ListCOMM.Count > 0;
	}

	private void MainMenuForm_ErrorReceived(object sender, SerialErrorReceivedEventArgs e)
	{
		throw new NotImplementedException();
	}

	private void Close_Click(object sender, EventArgs e)
	{
		Close();
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
			string text = Domain + "Software/SC%20F2-EVO/";
			if (User)
			{
				text = Domain + "Software/SC%20F2-EVO%20Sviluppo/";
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
		string NameProject = "SC F2-EVO";
		string NameFolder = "SC F2-EVO";
		if (User)
		{
			NameFolder = "SC F2-EVO Sviluppo";
		}
		string PathDataBase = path;
		UpdateAvaiable = await CheckUpdateAsync(path, PathDataBase);
		string arguments = $"-{NameFolder} -{NameProject} -{PathDataBase}";
		if (UpdateAvaiable && FormABS == null && FormCambi == null)
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

	private void MainMenuForm_Load(object sender, EventArgs e)
	{
		string machineID = Sistem.GetMachineID();
		Process currentProcess = Process.GetCurrentProcess();
		Process[] processesByName = Process.GetProcessesByName("SC F2-EVO");
		for (int i = 0; i < processesByName.Length; i++)
		{
			if (currentProcess.Id != processesByName[i].Id)
			{
				processesByName[i].Kill();
			}
		}
		if (!Debugger.IsAttached)
		{
			CheckUpdate();
		}
		string displayVersion = "";
		if (sender != null)
		{
			SetForm();
		}
		if (Sistem.IsApplicationInstalled("SC F2-EVO", out displayVersion))
		{
			Version.Text = "SC F2-EVO v" + displayVersion;
		}
		else
		{
			Version.Text = "SC F2-EVO vxx.xx.xxxx";
		}
		Text = Version.Text;
		Waite = new WhiteForm();
		Waite.Show();
		if (GetComm())
		{
			for (byte b = 0; b < COM.Length; b++)
			{
				if (byte.Parse(COM[b].PortName.Replace("COM", "")) < 100)
				{
					try
					{
						COM[b].Open();
						if (TestHydraulic == -1)
						{
							for (byte b2 = 0; b2 < 3; b2++)
							{
								COM[b].WriteLine("Hydraulics");
								Sistem.Delay(200.0);
								if (TestHydraulic != -1)
								{
									break;
								}
							}
						}
						if (TestElectronic == -1)
						{
							for (byte b3 = 0; b3 < 3; b3++)
							{
								COM[b].WriteLine("Electronics");
								Sistem.Delay(200.0);
								if (TestElectronic != -1)
								{
									break;
								}
							}
						}
						if (WASHINGBOARD == -1)
						{
							for (byte b4 = 0; b4 < 3; b4++)
							{
								COM[b].WriteLine("WASHING");
								Sistem.Delay(200.0);
								if (WASHINGBOARD != -1)
								{
									break;
								}
							}
						}
					}
					catch (Exception)
					{
					}
				}
			}
		}
		if (Waite != null)
		{
			Waite.Dispose();
			Waite.Close();
			Waite = null;
		}
		ListCardServices.Visible = User;
		ListModels.Visible = User;
		Dashboard.Visible = User;
		Washing.Visible = User;
	}

	public void COM_ErrorReceived(object sender, SerialErrorReceivedEventArgs e)
	{
	}

	public void COM_DataReceived(object sender, SerialDataReceivedEventArgs e)
	{
		sbyte b = 0;
		bool flag = false;
		SerialPort obj = (SerialPort)sender;
		b = 0;
		while (b < COM.Length && !COM[b].Equals(obj))
		{
			b++;
		}
		byte[] bytes = COM[b].Encoding.GetBytes(COM[b].ReadExisting());
		for (int i = 0; i < bytes.Length; i++)
		{
			char c = (char)bytes[i];
			flag = flag || c == '\n';
			BufferRx[b].Enqueue(c);
		}
		if (!flag)
		{
			return;
		}
		if (FormTest != null && !FormTest.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(FormTest.Handle_DataReceived), b);
			return;
		}
		if (FormABS != null && !FormABS.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(FormABS.Handle_DataReceived), b);
			return;
		}
		if (FormCambi != null && !FormCambi.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(FormCambi.Handle_DataReceived), b);
			return;
		}
		if (HydraulicBench != null && !HydraulicBench.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(HydraulicBench.Handle_DataReceived), b);
			return;
		}
		if (SensorForm != null && !SensorForm.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(SensorForm.Handle_DataReceived), b);
			return;
		}
		if (WashingForm != null && !WashingForm.IsDisposed)
		{
			Invoke(new DelegateHandleFrame(WashingForm.Handle_DataReceived), b);
			return;
		}
		try
		{
			Invoke(new DelegateHandleFrame(Handle_DataReceived), b);
		}
		catch
		{
		}
	}

	public void Handle_DataReceived(sbyte n)
	{
		try
		{
			while (BufferRx[n].Count > 0)
			{
				char c = BufferRx[n].Dequeue();
				DataUart[n] += c;
				if (c == '\n')
				{
					string text = DataUart[n];
				}
				if ((DataUart[n].IndexOf("Electronics") > -1 || DataUart[n].IndexOf("Test Centralina") > -1) && !Uscite)
				{
					COM[n].WriteLine("ACK Electronics");
					if (DataUart[n].IndexOf("Test Centralina") > -1)
					{
						N_STRING = 1;
					}
					string text2 = null;
					ElectronicsBoard.Text = "Electronics Board: Connected";
					ElectronicsBoard.ForeColor = Color.LimeGreen;
					while (BufferRx[n].Count > 0)
					{
						c = BufferRx[n].Dequeue();
						DataUart[n] += c;
					}
					if (DataUart[n].Split('\n').Length >= 2)
					{
						text2 = DataUart[n].Split('\n')[1];
					}
					if (text2 != null && text2.IndexOf("ver") == 0 && text2.Length >= 4)
					{
						Versione = text2.Substring(0, 4);
						ABS.Visible = true;
						AutomaticGearbox.Visible = User && N_STRING > 1;
						TestElectronic = n;
						DataUart[n] = "";
						Uscite = true;
					}
				}
				if (DataUart[n].IndexOf("Hydraulics") > -1)
				{
					COM[n].WriteLine("ACK Hydraulics");
					HydraulicsBoard.Text = "Hydraulics Board: Connected";
					HydraulicsBoard.ForeColor = Color.LimeGreen;
					HyderaulicBenche.Visible = true;
					Sensor.Visible = true;
					TestHydraulic = n;
					DataUart[n] = "";
					COM[n].DiscardInBuffer();
				}
				if (DataUart[n].IndexOf("WASHING") > -1)
				{
					COM[n].WriteLine("ACK WASHING");
					WashingBoard.Text = "Washing Board: Connected";
					WashingBoard.ForeColor = Color.LimeGreen;
					Washing.Visible = true;
					WASHINGBOARD = n;
					DataUart[n] = "";
					COM[n].DiscardInBuffer();
				}
				if (c == '\n')
				{
					if (TestElectronic > -1)
					{
					}
					DataUart[n] = "";
				}
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void SetForm()
	{
		Bitmap logo = Resources.Logo;
		bkg = logo.GetPixel(0, 0);
		fore = logo.GetPixel(961, 110);
		Logo.Image = logo;
		BackColor = bkg;
		Logo.Left = 10;
		Logo.Height = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.4);
		Logo.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.6);
		Logo.Top = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.3);
		Button[] bTN = BTN;
		foreach (Button button in bTN)
		{
			button.BackColor = bkg;
		}
		Buttons.Top = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.1);
		Buttons.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.355);
		Buttons.Height = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.8);
		Buttons.Left = SystemInformation.WorkingArea.Size.Width - Buttons.Width;
		Font font = new Font(ABS.Font.FontFamily, 42 * SystemInformation.WorkingArea.Size.Width / 1920, FontStyle.Bold);
		double num = (Buttons.Height - 60) / BTN.Length;
		double num2 = Buttons.Height / BTN.Length;
		double num3 = 0.0;
		Button[] bTN2 = BTN;
		foreach (Button button2 in bTN2)
		{
			button2.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.35);
			button2.Height = (int)num;
			double num4 = num2 * num3++;
			button2.Top = (int)num4;
			button2.Left = 0;
			button2.BackColor = bkg;
			float num5 = 42 * SystemInformation.WorkingArea.Size.Width / 1920;
			double num6 = (double)SystemInformation.WorkingArea.Size.Width * 0.29;
			float num7;
			do
			{
				font = (button2.Font = new Font(ABS.Font.FontFamily, num5 * (float)SystemInformation.WorkingArea.Size.Width / 1920f, FontStyle.Bold));
				num5 -= 0.25f;
				num7 = button2.CreateGraphics().MeasureString(button2.Text, font).Width;
			}
			while ((double)num7 >= num6);
			if (button2 != null)
			{
				button2.FlatAppearance.BorderColor = bkg;
			}
		}
		ABS.BackgroundImage = new Bitmap("Buttons\\Battery Voltage.jpg");
		Sensor.BackgroundImage = new Bitmap("Buttons\\Sensor.jpg");
		HyderaulicBenche.BackgroundImage = new Bitmap("Buttons\\Pressure Test.jpg");
		Washing.BackgroundImage = new Bitmap("Buttons\\Washing.jpg");
		AutomaticGearbox.BackgroundImage = new Bitmap("Buttons\\Valve test.jpg");
	}

	private void Config_Click(object sender, EventArgs e)
	{
		FormConfig formConfig = new FormConfig();
		formConfig.ShowDialog();
		formConfig.Close();
		formConfig.Dispose();
		formConfig = null;
	}

	private void ListModels_Click(object sender, EventArgs e)
	{
		new FormListModels(0).ShowDialog();
	}

	public static void delay(double ms)
	{
		DateTime now = DateTime.Now;
		while (DateTime.Now.Subtract(now).TotalMilliseconds < ms)
		{
			Application.DoEvents();
		}
	}

	private void Sensor_Click(object sender, EventArgs e)
	{
		if (TestHydraulic != -1 || (User && MessageBox.Show("Banco idraulico non connesso. Continuare?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No))
		{
			Cursor = Cursors.WaitCursor;
			FormListModels formListModels = new FormListModels(1);
			Cursor = Cursors.Default;
			if (formListModels.ShowDialog() == DialogResult.OK)
			{
				SensorForm = new FormSensor(formListModels.ID_ABS);
				SensorForm.ShowDialog();
			}
			formListModels.Dispose();
			formListModels = null;
		}
	}

	private void ABS_Click(object sender, EventArgs e)
	{
		string text = null;
		Crono = DateTime.Now;
		Cursor = Cursors.WaitCursor;
		CardService = -1;
		text = ((!File.Exists("Config.txt")) ? "" : File.ReadAllLines("Config.txt")[0]);
		Cursor = Cursors.Default;
		sbyte b = -1;
		Chiudi.Enabled = false;
		for (int i = 0; i < DataUart.Length; i++)
		{
			DataUart[i] = "";
		}
		if (sender.Equals(ABS))
		{
			FormABS = new ABS(text);
			FormABS.Owner = this;
		}
		else
		{
			FormCambi = new Cambi(text);
			FormCambi.Owner = this;
		}
		if (Waite != null)
		{
			Waite.Close();
			Waite.Dispose();
		}
		Waite = null;
		base.Opacity = 0.0;
		DialogResult dialogResult = ((!sender.Equals(ABS)) ? FormCambi.ShowDialog() : FormABS.ShowDialog());
		base.Opacity = 100.0;
		if (sender.Equals(ABS))
		{
			FormABS.Dispose();
			FormABS = null;
		}
		else
		{
			FormCambi.Dispose();
			FormCambi = null;
		}
		if (dialogResult == DialogResult.Ignore && TestElectronic > -1)
		{
			try
			{
				b = TestElectronic;
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Set Rele OFF");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				b = TestHydraulic;
				if (TestHydraulic > -1 && COM[TestHydraulic].IsOpen)
				{
					COM[TestHydraulic].WriteLine("RELEASE");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				b = TestElectronic;
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Frequency:0Hz");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Select OUT:0");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Passive");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Stop Test");
				}
			}
			catch
			{
			}
			Sistem.Delay(500.0);
			try
			{
				if (COM[TestElectronic].IsOpen)
				{
					COM[TestElectronic].WriteLine("Set ReleExt OFF");
				}
			}
			catch
			{
			}
		}
		Chiudi.Enabled = true;
		if (UpdateAvaiable && FormABS == null)
		{
			string text2 = "";
			string[] array = Environment.CommandLine.Split('-');
			string arg = "SC_F2_EVO";
			string arg2 = "Test Bench electronic";
			string arg3 = "";
			string arguments = $"-{arg2} -{arg} -{arg3}";
			if (array.Length > 1)
			{
				text2 += array[1];
			}
			if (text2 != "")
			{
				Directory.SetCurrentDirectory(text2);
			}
			FileInfo file = new FileInfo("Update.exe");
			while (Prmission.IsFileLocked(file))
			{
				Application.DoEvents();
			}
			ProcessStartInfo processStartInfo = new ProcessStartInfo();
			processStartInfo.UseShellExecute = true;
			processStartInfo.WorkingDirectory = Environment.CurrentDirectory;
			processStartInfo.FileName = "Update.exe";
			processStartInfo.Arguments = arguments;
			processStartInfo.Verb = "runas";
			Process.Start(processStartInfo);
			Application.Exit();
		}
	}

	private void hydraulicBench_Click(object sender, EventArgs e)
	{
		HyderaulicBenche.ForeColor = SystemColors.Control;
		if (TestHydraulic != -1 || (User && MessageBox.Show("Banco idraulico non connesso. Continuare?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No))
		{
			Cursor = Cursors.WaitCursor;
			HydraulicBench = new FormHydraulicBench();
			HydraulicBench.Owner = this;
			Cursor = Cursors.Default;
			HydraulicBench.ShowDialog();
			HydraulicBench.Dispose();
			HydraulicBench = null;
		}
	}

	private void btnWashing_Click(object sender, EventArgs e)
	{
		if (WASHINGBOARD != -1 || (User && MessageBox.Show("Lavaggio non connesso. Continuare?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No))
		{
			WashingForm = new FormWashing();
			WashingForm.ShowDialog();
		}
	}

	private void ListCardServices_Click(object sender, EventArgs e)
	{
		string arguments = "-list card services";
		string installSourceStringApplicationInstalled = Sistem.GetInstallSourceStringApplicationInstalled("Test Bench ABS");
		if (installSourceStringApplicationInstalled != null && installSourceStringApplicationInstalled != "")
		{
			ProcessStartInfo processStartInfo = new ProcessStartInfo();
			processStartInfo.UseShellExecute = true;
			processStartInfo.WorkingDirectory = installSourceStringApplicationInstalled;
			processStartInfo.FileName = "TestABS.exe";
			processStartInfo.Arguments = arguments;
			processStartInfo.Verb = "runas";
			Process.Start(processStartInfo);
		}
	}

	private void AutomaticGearbox_Click(object sender, EventArgs e)
	{
		if (User)
		{
			ABS_Click(Washing, e);
		}
	}

	private void DashBoard_Click(object sender, EventArgs e)
	{
		Chiudi.Enabled = false;
		for (byte b = 0; b < DataUart.Length; b++)
		{
			DataUart[b] = "";
		}
		FormTest = new WorkinigProgress();
		if (Waite != null)
		{
			Waite.Close();
			Waite.Dispose();
		}
		Waite = null;
		FormTest.ShowDialog();
		FormTest.Dispose();
		FormTest = null;
		if (TestElectronic > -1)
		{
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Set Rele OFF");
			}
			Sistem.Delay(500.0);
			if (TestHydraulic > -1 && COM[TestHydraulic].IsOpen)
			{
				COM[TestHydraulic].WriteLine("RELEASE");
			}
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Frequency:0Hz");
			}
			Sistem.Delay(500.0);
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Select OUT:0");
			}
			Sistem.Delay(500.0);
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Passive");
			}
			Sistem.Delay(500.0);
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Stop Test");
			}
			Sistem.Delay(500.0);
			if (COM[TestElectronic].IsOpen)
			{
				COM[TestElectronic].WriteLine("Set ReleExt OFF");
			}
		}
		Chiudi.Enabled = true;
	}

	private void Mouse_Hover(object sender, EventArgs e)
	{
		Button button = (Button)sender;
		Button[] bTN = BTN;
		foreach (Button button2 in bTN)
		{
			button2.ForeColor = SystemColors.ControlText;
		}
		button.ForeColor = SystemColors.Control;
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
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SC_F2_EVO.MainMenuForm));
		this.Chiudi = new System.Windows.Forms.Button();
		this.Logo = new System.Windows.Forms.PictureBox();
		this.ABS = new System.Windows.Forms.Button();
		this.Buttons = new System.Windows.Forms.Panel();
		this.Washing = new System.Windows.Forms.Button();
		this.Sensor = new System.Windows.Forms.Button();
		this.HyderaulicBenche = new System.Windows.Forms.Button();
		this.AutomaticGearbox = new System.Windows.Forms.Button();
		this.ElectronicsBoard = new System.Windows.Forms.Label();
		this.Version = new System.Windows.Forms.Label();
		this.Dashboard = new System.Windows.Forms.Button();
		this.btnConfig = new System.Windows.Forms.Button();
		this.ListModels = new System.Windows.Forms.Button();
		this.ListCardServices = new System.Windows.Forms.Button();
		this.HydraulicsBoard = new System.Windows.Forms.Label();
		this.WashingBoard = new System.Windows.Forms.Label();
		((System.ComponentModel.ISupportInitialize)this.Logo).BeginInit();
		this.Buttons.SuspendLayout();
		base.SuspendLayout();
		this.Chiudi.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.Chiudi.Location = new System.Drawing.Point(1124, 649);
		this.Chiudi.Name = "Chiudi";
		this.Chiudi.Size = new System.Drawing.Size(75, 23);
		this.Chiudi.TabIndex = 7;
		this.Chiudi.Text = "Close";
		this.Chiudi.UseVisualStyleBackColor = true;
		this.Chiudi.Click += new System.EventHandler(Close_Click);
		this.Logo.Anchor = System.Windows.Forms.AnchorStyles.None;
		this.Logo.BackColor = System.Drawing.SystemColors.Control;
		this.Logo.Image = SC_F2_EVO.Properties.Resources.Logo;
		this.Logo.Location = new System.Drawing.Point(21, 323);
		this.Logo.Name = "Logo";
		this.Logo.Size = new System.Drawing.Size(458, 39);
		this.Logo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.Logo.TabIndex = 1;
		this.Logo.TabStop = false;
		this.ABS.Anchor = System.Windows.Forms.AnchorStyles.None;
		this.ABS.AutoSize = true;
		this.ABS.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.ABS.Cursor = System.Windows.Forms.Cursors.Hand;
		this.ABS.FlatAppearance.BorderSize = 0;
		this.ABS.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.Control;
		this.ABS.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.ABS.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.ABS.Font = new System.Drawing.Font("Calibri", 26.25f, System.Drawing.FontStyle.Bold);
		this.ABS.Location = new System.Drawing.Point(148, 3);
		this.ABS.Name = "ABS";
		this.ABS.Size = new System.Drawing.Size(169, 69);
		this.ABS.TabIndex = 0;
		this.ABS.Text = "ABS";
		this.ABS.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.ABS.UseVisualStyleBackColor = true;
		this.ABS.Visible = false;
		this.ABS.Click += new System.EventHandler(ABS_Click);
		this.ABS.MouseHover += new System.EventHandler(Mouse_Hover);
		this.Buttons.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.Buttons.Controls.Add(this.Washing);
		this.Buttons.Controls.Add(this.Sensor);
		this.Buttons.Controls.Add(this.HyderaulicBenche);
		this.Buttons.Controls.Add(this.AutomaticGearbox);
		this.Buttons.Controls.Add(this.ABS);
		this.Buttons.Location = new System.Drawing.Point(657, 200);
		this.Buttons.Name = "Buttons";
		this.Buttons.Size = new System.Drawing.Size(465, 284);
		this.Buttons.TabIndex = 3;
		this.Washing.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Washing.AutoSize = true;
		this.Washing.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Washing.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Washing.FlatAppearance.BorderSize = 0;
		this.Washing.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.Washing.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.Control;
		this.Washing.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.Washing.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Washing.Font = new System.Drawing.Font("Microsoft Tai Le", 27.75f, System.Drawing.FontStyle.Bold);
		this.Washing.Location = new System.Drawing.Point(59, 223);
		this.Washing.Name = "Washing";
		this.Washing.Size = new System.Drawing.Size(373, 58);
		this.Washing.TabIndex = 1;
		this.Washing.Text = "WASHING";
		this.Washing.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.Washing.UseVisualStyleBackColor = true;
		this.Washing.Visible = false;
		this.Washing.Click += new System.EventHandler(btnWashing_Click);
		this.Washing.MouseHover += new System.EventHandler(Mouse_Hover);
		this.Sensor.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Sensor.AutoSize = true;
		this.Sensor.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Sensor.FlatAppearance.BorderSize = 0;
		this.Sensor.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.Sensor.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.Control;
		this.Sensor.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.Sensor.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Sensor.Font = new System.Drawing.Font("Microsoft Tai Le", 27.75f, System.Drawing.FontStyle.Bold);
		this.Sensor.Location = new System.Drawing.Point(86, 176);
		this.Sensor.Name = "Sensor";
		this.Sensor.Size = new System.Drawing.Size(346, 58);
		this.Sensor.TabIndex = 4;
		this.Sensor.Text = "SENSOR";
		this.Sensor.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.Sensor.UseVisualStyleBackColor = true;
		this.Sensor.Visible = false;
		this.Sensor.Click += new System.EventHandler(Sensor_Click);
		this.Sensor.MouseHover += new System.EventHandler(Mouse_Hover);
		this.HyderaulicBenche.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.HyderaulicBenche.AutoSize = true;
		this.HyderaulicBenche.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.HyderaulicBenche.Cursor = System.Windows.Forms.Cursors.Hand;
		this.HyderaulicBenche.FlatAppearance.BorderSize = 0;
		this.HyderaulicBenche.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.HyderaulicBenche.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.Control;
		this.HyderaulicBenche.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.HyderaulicBenche.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.HyderaulicBenche.Font = new System.Drawing.Font("Microsoft Tai Le", 27.75f, System.Drawing.FontStyle.Bold);
		this.HyderaulicBenche.Location = new System.Drawing.Point(18, 123);
		this.HyderaulicBenche.Name = "HyderaulicBenche";
		this.HyderaulicBenche.Size = new System.Drawing.Size(444, 58);
		this.HyderaulicBenche.TabIndex = 3;
		this.HyderaulicBenche.Text = "HYDRAULIC BENCH";
		this.HyderaulicBenche.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.HyderaulicBenche.UseVisualStyleBackColor = true;
		this.HyderaulicBenche.Visible = false;
		this.HyderaulicBenche.Click += new System.EventHandler(hydraulicBench_Click);
		this.HyderaulicBenche.MouseHover += new System.EventHandler(Mouse_Hover);
		this.AutomaticGearbox.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.AutomaticGearbox.AutoSize = true;
		this.AutomaticGearbox.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.AutomaticGearbox.Cursor = System.Windows.Forms.Cursors.Hand;
		this.AutomaticGearbox.FlatAppearance.BorderSize = 0;
		this.AutomaticGearbox.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.AutomaticGearbox.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.Control;
		this.AutomaticGearbox.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.AutomaticGearbox.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.AutomaticGearbox.Font = new System.Drawing.Font("Microsoft Tai Le", 27.75f, System.Drawing.FontStyle.Bold);
		this.AutomaticGearbox.Location = new System.Drawing.Point(18, 66);
		this.AutomaticGearbox.Name = "AutomaticGearbox";
		this.AutomaticGearbox.Size = new System.Drawing.Size(433, 58);
		this.AutomaticGearbox.TabIndex = 2;
		this.AutomaticGearbox.Text = "AUTOMATIC GEARBOX";
		this.AutomaticGearbox.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.AutomaticGearbox.UseVisualStyleBackColor = true;
		this.AutomaticGearbox.Visible = false;
		this.AutomaticGearbox.Click += new System.EventHandler(AutomaticGearbox_Click);
		this.AutomaticGearbox.MouseHover += new System.EventHandler(Mouse_Hover);
		this.ElectronicsBoard.AllowDrop = true;
		this.ElectronicsBoard.AutoSize = true;
		this.ElectronicsBoard.Font = new System.Drawing.Font("Microsoft Tai Le", 14.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ElectronicsBoard.ForeColor = System.Drawing.Color.Red;
		this.ElectronicsBoard.Location = new System.Drawing.Point(32, 28);
		this.ElectronicsBoard.Name = "ElectronicsBoard";
		this.ElectronicsBoard.Size = new System.Drawing.Size(294, 23);
		this.ElectronicsBoard.TabIndex = 4;
		this.ElectronicsBoard.Text = "Electronics Board: Disconnected";
		this.Version.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Version.AutoSize = true;
		this.Version.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f);
		this.Version.Location = new System.Drawing.Point(1005, 28);
		this.Version.Name = "Version";
		this.Version.Size = new System.Drawing.Size(63, 20);
		this.Version.TabIndex = 5;
		this.Version.Text = "Version";
		this.Dashboard.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.Dashboard.Location = new System.Drawing.Point(922, 649);
		this.Dashboard.Name = "Dashboard";
		this.Dashboard.Size = new System.Drawing.Size(88, 23);
		this.Dashboard.TabIndex = 5;
		this.Dashboard.Text = "DASHBOARD";
		this.Dashboard.UseVisualStyleBackColor = true;
		this.Dashboard.Visible = false;
		this.Dashboard.Click += new System.EventHandler(DashBoard_Click);
		this.btnConfig.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.btnConfig.Location = new System.Drawing.Point(1047, 649);
		this.btnConfig.Name = "btnConfig";
		this.btnConfig.Size = new System.Drawing.Size(71, 23);
		this.btnConfig.TabIndex = 8;
		this.btnConfig.Text = "Config";
		this.btnConfig.UseVisualStyleBackColor = true;
		this.btnConfig.Click += new System.EventHandler(Config_Click);
		this.ListModels.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.ListModels.Location = new System.Drawing.Point(734, 649);
		this.ListModels.Name = "ListModels";
		this.ListModels.Size = new System.Drawing.Size(88, 23);
		this.ListModels.TabIndex = 9;
		this.ListModels.Text = "List Models";
		this.ListModels.UseVisualStyleBackColor = true;
		this.ListModels.Visible = false;
		this.ListModels.Click += new System.EventHandler(ListModels_Click);
		this.ListCardServices.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.ListCardServices.Location = new System.Drawing.Point(576, 649);
		this.ListCardServices.Name = "ListCardServices";
		this.ListCardServices.Size = new System.Drawing.Size(106, 23);
		this.ListCardServices.TabIndex = 10;
		this.ListCardServices.Text = "List card services";
		this.ListCardServices.UseVisualStyleBackColor = true;
		this.ListCardServices.Visible = false;
		this.ListCardServices.Click += new System.EventHandler(ListCardServices_Click);
		this.HydraulicsBoard.AllowDrop = true;
		this.HydraulicsBoard.AutoSize = true;
		this.HydraulicsBoard.Font = new System.Drawing.Font("Microsoft Tai Le", 14.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.HydraulicsBoard.ForeColor = System.Drawing.Color.Red;
		this.HydraulicsBoard.Location = new System.Drawing.Point(32, 51);
		this.HydraulicsBoard.Name = "HydraulicsBoard";
		this.HydraulicsBoard.Size = new System.Drawing.Size(293, 23);
		this.HydraulicsBoard.TabIndex = 11;
		this.HydraulicsBoard.Text = "Hydraulics Board: Disconnected";
		this.WashingBoard.AllowDrop = true;
		this.WashingBoard.AutoSize = true;
		this.WashingBoard.Font = new System.Drawing.Font("Microsoft Tai Le", 14.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.WashingBoard.ForeColor = System.Drawing.Color.Red;
		this.WashingBoard.Location = new System.Drawing.Point(33, 74);
		this.WashingBoard.Name = "WashingBoard";
		this.WashingBoard.Size = new System.Drawing.Size(276, 23);
		this.WashingBoard.TabIndex = 12;
		this.WashingBoard.Text = "Washing Board: Disconnected";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1217, 684);
		base.Controls.Add(this.WashingBoard);
		base.Controls.Add(this.HydraulicsBoard);
		base.Controls.Add(this.ListCardServices);
		base.Controls.Add(this.ListModels);
		base.Controls.Add(this.btnConfig);
		base.Controls.Add(this.Dashboard);
		base.Controls.Add(this.Version);
		base.Controls.Add(this.ElectronicsBoard);
		base.Controls.Add(this.Buttons);
		base.Controls.Add(this.Logo);
		base.Controls.Add(this.Chiudi);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.MaximizeBox = false;
		base.Name = "MainMenuForm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "SC F2/EVO";
		base.WindowState = System.Windows.Forms.FormWindowState.Maximized;
		base.Load += new System.EventHandler(MainMenuForm_Load);
		((System.ComponentModel.ISupportInitialize)this.Logo).EndInit();
		this.Buttons.ResumeLayout(false);
		this.Buttons.PerformLayout();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
