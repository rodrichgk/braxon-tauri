using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ElectronikSistem;
using SC_F2_EVO.Properties;

namespace SC_F2_EVO;

public class ABS : Form
{
	private delegate void Handle_RequestReceived(Socket client, string request);

	private delegate void Handle_ResponseReceived(string response, string host);

	private delegate void Handle_Response(string response, string host);

	private double Coefficient = 0.16;

	private double MetriSec = 1.0;

	private string Frame;

	private Queue<COMMAND> BufferTx;

	private ModelComponent Car;

	private int WheelTest;

	private int Samples = 0;

	private string[] Status = new string[8];

	private string Response;

	private string Company;

	private string ResultComunication = "NO";

	private bool[] ErrorCom = new bool[4];

	private Queue<FRAME> MotorDataCAN;

	private Queue<FRAME> BaseDataCAN;

	private Control[] BTN;

	private Control[] Wheel;

	private Control[] ValSens;

	private Control[] CANTest;

	private byte ErrorConnection = 0;

	private byte Release = 0;

	private bool TestEnable = false;

	private bool HTTPReponse = false;

	private bool EnableTurnOff = false;

	private bool WaitComunication;

	private bool IsElectronicConnected = false;

	private bool WaitResponse = false;

	private double Velocita = 0.0;

	private double Voltage;

	private double MaxSpeed = 0.0;

	private double TestSpeed = 0.0;

	private double MaxCurrent = 0.0;

	private Dictionary<int, string> PressuresText = new Dictionary<int, string>();

	private double[,] Pressure = new double[4, 4];

	private double[,] Pressures = new double[16, 4];

	private object[] ControlComunication;

	private Bitmap ImgLogo;

	private PrinterControl Printer;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private DataTable TableBase;

	private DataTable TableMotor;

	private JavaScriptSerializer Serializer;

	private HTTP Request;

	private Progress ProgressBar;

	private FormCompilePrint CompilePrint;

	private FormReport Report;

	private FormReport Terminal;

	private Report NumberReport;

	private HTTP BOARD;

	private const int CP_NOCLOSE_BUTTON = 512;

	private IContainer components = null;

	private Button Back;

	private PictureBox ImgCar;

	private Button BatteryVoltage;

	private Panel Buttons;

	private Button SpeedTest;

	private Button ValveTest;

	private Button MotorTest;

	private Button WheelLockTest;

	private Button KeyPower;

	private Panel Values;

	private Button Voltometer;

	private Button Current;

	private Button Sensor1;

	private Button Sensor2;

	private Button Sensor3;

	private Button Sensor4;

	private PictureBox Logo;

	private Label label1;

	private TrackBar Frequeza;

	private Label Model;

	private Button BreakTest;

	private Timer Read;

	private Timer Polling;

	private Label label2;

	private Timer SpeedTimer;

	private Button Print;

	private Button Comunication;

	private Button btnResponse;

	private Timer MotorOff;

	private Button Bleeding;

	private Label ResponseCom;

	private SaveFileDialog SaveReportDialog;

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams createParams = base.CreateParams;
			createParams.ClassStyle |= 512;
			return createParams;
		}
	}

	public ABS(string Company)
	{
		this.Company = Company;
		InitializeComponent();
		Initialize();
		Printer = new PrinterControl();
		Printer.BeginPrint += Printer_BeginPrint;
		Printer.PrintPage += Printer_PrintPage;
		Printer.EndPrint += Printer_EndPrint;
		BOARD = new HTTP();
		BOARD.EventHandlerResponse += HTTP_Response;
		if (MainMenuForm.User)
		{
			base.FormBorderStyle = FormBorderStyle.Fixed3D;
		}
		ControlComunication = new object[3]
		{
			"",
			0,
			(byte)0
		};
	}

	private void Initialize()
	{
		Serializer = new JavaScriptSerializer();
		BufferTx = new Queue<COMMAND>();
		BTN = new Control[8] { BatteryVoltage, KeyPower, SpeedTest, MotorTest, ValveTest, BreakTest, WheelLockTest, Frequeza };
		ValSens = new Control[7] { Voltometer, Current, Comunication, Sensor1, Sensor2, Sensor3, Sensor4 };
		Wheel = new Control[4] { Sensor1, Sensor2, Sensor3, Sensor4 };
		CANTest = new Control[2] { MotorTest, ValveTest };
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		adapter = new OleDbDataAdapter(Command);
		BaseDataCAN = new Queue<FRAME>();
		MotorDataCAN = new Queue<FRAME>();
		CompilePrint = new FormCompilePrint();
	}

	private void MainMenuForm_Load(object sender, EventArgs e)
	{
		SetFrom();
		TableBase = new DataTable();
		TableMotor = new DataTable();
		BaseDataCAN = new Queue<FRAME>();
		MotorDataCAN = new Queue<FRAME>();
		BreakTest.Visible = MainMenuForm.User;
		WheelLockTest.Visible = MainMenuForm.User;
	}

	private void RequestReceived(Socket client, string request)
	{
		string text = null;
		string text2 = request.Substring(request.IndexOf('?') + 1);
		try
		{
			Dictionary<string, string> dictionary = new Dictionary<string, string>();
			request = request.Split('?')[0];
			HTTPReponse = true;
			if (text2.Trim() != request)
			{
				string[] array = text2.Split('&');
				foreach (string text3 in array)
				{
					string key = text3.Split('=')[0];
					string value = text3.Split('=')[1];
					dictionary.Add(key, value);
				}
			}
			switch (request)
			{
			case "Status":
			{
				text = "";
				HTTPReponse = false;
				string[] status = Status;
				foreach (string text5 in status)
				{
					text = text + ";" + text5;
				}
				text = text.Substring(1);
				break;
			}
			case "BATTERY":
				if (dictionary["State"] == "ON")
				{
					BatteryVoltage.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					BatteryVoltage.ForeColor = SystemColors.Control;
				}
				BatteryVoltage.PerformClick();
				break;
			case "KEYPOWER":
				if (dictionary["State"] == "ON")
				{
					KeyPower.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					KeyPower.ForeColor = SystemColors.Control;
				}
				KeyPower.PerformClick();
				break;
			case "MOTORTEST":
				if (dictionary["State"] == "ON")
				{
					MotorTest.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					MotorTest.ForeColor = SystemColors.Control;
				}
				MotorTest.PerformClick();
				break;
			case "VALVETEST":
				if (dictionary["State"] == "ON")
				{
					ValveTest.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					ValveTest.ForeColor = SystemColors.Control;
				}
				ValveTest.PerformClick();
				break;
			case "SPEEDTEST":
				if (dictionary["State"] == "ON")
				{
					SpeedTest.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					SpeedTest.ForeColor = SystemColors.Control;
				}
				SpeedTest.PerformClick();
				break;
			case "BREAKTEST":
				if (dictionary["State"] == "ON")
				{
					BreakTest.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					BreakTest.ForeColor = SystemColors.Control;
				}
				BreakTest.PerformClick();
				break;
			case "WHEELLOCKTEST":
				if (dictionary["State"] == "ON")
				{
					WheelLockTest.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					WheelLockTest.ForeColor = SystemColors.Control;
				}
				WheelLockTest.PerformClick();
				break;
			case "SENSOR":
			{
				int num2 = int.Parse(dictionary["Wheel"]) - 1;
				if (dictionary["State"] == "ON")
				{
					Wheel[num2].ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					Wheel[num2].ForeColor = SystemColors.Control;
				}
				((Button)Wheel[num2]).PerformClick();
				text = "SENSOR" + dictionary["Wheel"] + ":" + dictionary["State"];
				break;
			}
			case "SETSPEED":
			{
				int num = int.Parse(dictionary["Speed"]);
				Frequeza_KeyUp(num, null);
				text = "SETSPEED:" + dictionary["Speed"];
				break;
			}
			case "MODEL":
			{
				string s = dictionary["ID"];
				string text4 = dictionary["Model"];
				MainMenuForm.ID_Modello = int.Parse(s);
				MainMenuForm.NomeModello = text4.Replace("%20", " ");
				Model_Click(null, null);
				text = request;
				break;
			}
			default:
				HTTPReponse = false;
				break;
			}
			if (HTTPReponse || text != null)
			{
				if (text == null)
				{
					text = request + ":" + dictionary["State"];
				}
				text += "\r\nOK\r\n";
				text = string.Format(File.ReadAllText("Header.txt"), text.Length) + text;
			}
		}
		catch (Exception ex)
		{
			text = string.Format(File.ReadAllText("Error.txt"), ex.Message.Length + 109, ex.Message);
		}
		HTTPReponse = false;
	}

	private void EventHandlerResponse(string response, string host)
	{
		if (base.IsHandleCreated)
		{
			Invoke(new Handle_ResponseReceived(ResponseReceived), response, host);
		}
	}

	private void ResponseReceived(string response, string host)
	{
		HTTPReponse = true;
		response = response.Split('\r')[0];
		switch (response)
		{
		case "BATTERY:ON":
			BatteryVoltage.ForeColor = SystemColors.ControlText;
			BatteryVoltage.PerformClick();
			break;
		case "BATTERY:OFF":
			BatteryVoltage.ForeColor = SystemColors.Control;
			BatteryVoltage.PerformClick();
			break;
		case "KEYPOWER:ON":
			KeyPower.ForeColor = SystemColors.ControlText;
			KeyPower.PerformClick();
			break;
		case "KEYPOWER:OFF":
			KeyPower.ForeColor = SystemColors.Control;
			KeyPower.PerformClick();
			break;
		case "MOTORTEST:ON":
			MotorTest.ForeColor = SystemColors.ControlText;
			MotorTest.PerformClick();
			break;
		case "MOTORTEST:OFF":
			MotorTest.ForeColor = SystemColors.Control;
			MotorTest.PerformClick();
			break;
		case "VALVETEST:ON":
			ValveTest.ForeColor = SystemColors.ControlText;
			ValveTest.PerformClick();
			break;
		case "VALVETEST:OFF":
			ValveTest.ForeColor = SystemColors.Control;
			ValveTest.PerformClick();
			break;
		case "SPEEDTEST:ON":
			SpeedTest.ForeColor = SystemColors.ControlText;
			SpeedTest.PerformClick();
			break;
		case "SPEEDTEST:OFF":
			SpeedTest.ForeColor = SystemColors.Control;
			SpeedTest.PerformClick();
			break;
		case "BREAKTEST:ON":
			BreakTest.ForeColor = SystemColors.ControlText;
			BreakTest.PerformClick();
			break;
		case "BREAKTEST:OFF":
			BreakTest.ForeColor = SystemColors.Control;
			BreakTest.PerformClick();
			break;
		case "WHEELLOCKTEST:ON":
			WheelLockTest.ForeColor = SystemColors.ControlText;
			WheelLockTest.PerformClick();
			break;
		case "WHEELLOCKTEST:OFF":
			WheelLockTest.ForeColor = SystemColors.Control;
			WheelLockTest.PerformClick();
			break;
		case "MODEL":
			Model_Click(null, null);
			break;
		default:
		{
			string[] array = response.Split(';');
			if (array.Length == 8)
			{
				HTTPReponse = false;
				Voltometer.Text = array[0] + " V";
				Current.Text = array[1] + " A";
				Comunication.Text = "Comunication: " + array[2];
				if (KeyPower.ForeColor == SystemColors.Control && array[2] != "None")
				{
					StartTest();
				}
				SpeedTest.Text = "SPEED TEST";
				Sensor1.Text = "FRONT LEFT";
				Sensor2.Text = "FRONT RIGHT";
				Sensor3.Text = "REAR LEFT";
				Sensor4.Text = "REAR RIGHT";
				if (array[3] != "")
				{
					Button speedTest = SpeedTest;
					speedTest.Text = speedTest.Text + ": " + array[3] + " K/h";
				}
				if (array[4] != "")
				{
					Button sensor = Sensor1;
					sensor.Text = sensor.Text + ": " + array[4] + " K/h";
				}
				if (array[5] != "")
				{
					Button sensor2 = Sensor2;
					sensor2.Text = sensor2.Text + ": " + array[5] + " K/h";
				}
				if (array[6] != "")
				{
					Button sensor3 = Sensor3;
					sensor3.Text = sensor3.Text + ": " + array[6] + " K/h";
				}
				if (array[7] != "")
				{
					Button sensor4 = Sensor4;
					sensor4.Text = sensor4.Text + ": " + array[7] + " K/h";
				}
				SetSize(Comunication);
				SetSize(SpeedTest);
				SetSize(Sensor1);
				SetSize(Sensor2);
				SetSize(Sensor3);
				SetSize(Sensor4);
			}
			else if (response.IndexOf("SENSOR") > -1)
			{
				int num = int.Parse(response.Replace("SENSOR", "").Split(':')[0]) - 1;
				string text = response.Split(':')[1];
				if (text == "ON")
				{
					Wheel[num].ForeColor = SystemColors.ControlText;
				}
				else if (text == "OFF")
				{
					Wheel[num].ForeColor = SystemColors.Control;
				}
				((Button)Wheel[num]).PerformClick();
			}
			else if (response.IndexOf("SETSPEED") > -1)
			{
				int num2 = int.Parse(response.Split(':')[1]);
				Frequeza_KeyUp(num2, null);
			}
			break;
		}
		}
		HTTPReponse = false;
	}

	private void ABS_Activated(object sender, EventArgs e)
	{
	}

	private void ReleaseElectronic(bool forced)
	{
		DateTime now = DateTime.Now;
		Read.Stop();
		Polling.Stop();
		Sistem.Delay(300.0);
		if (MainMenuForm.TestHydraulic != -1)
		{
			WaitResponse = false;
			do
			{
				MainMenuForm.COM[MainMenuForm.TestHydraulic].WriteLine("HYDRAULIC");
				Sistem.Delay(300.0);
			}
			while (!WaitResponse && DateTime.Now.Subtract(now).TotalMilliseconds < 3000.0);
		}
		if (!forced)
		{
			base.DialogResult = DialogResult.OK;
		}
		else
		{
			base.DialogResult = DialogResult.Ignore;
		}
	}

	private void Close_Click(object sender, EventArgs e)
	{
		if (KeyPower.ForeColor == SystemColors.Control || (Comunication.Text.IndexOf("None") == -1 && Comunication.Text.Replace("Comunication", "").Length > 3))
		{
			if (MessageBox.Show("Disable the ABS\r\n\r\nClose Anyway?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
			{
				ReleaseElectronic(forced: true);
			}
		}
		else if (BatteryVoltage.ForeColor == SystemColors.Control)
		{
			if (MessageBox.Show("Disable the Battery voltage\r\n\r\nClose Anyway?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
			{
				ReleaseElectronic(forced: true);
			}
		}
		else
		{
			ReleaseElectronic(forced: false);
		}
	}

	private void SetFrom()
	{
		Bitmap image = new Bitmap("Car\\Wheel0.jpg");
		ImgCar.Image = image;
		ImgCar.Top = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.4);
		ImgCar.Left = (SystemInformation.WorkingArea.Size.Width - ImgCar.Width) / 2;
		Logo.Top = 10;
		Logo.Height = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.2);
		Logo.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.35);
		Logo.Left = (SystemInformation.WorkingArea.Size.Width - Logo.Width) / 2;
		ResponseCom.Top += 10;
		ResponseCom.Left = Logo.Left + Logo.Width + 20;
		ResponseCom.Visible = MainMenuForm.User;
		Model.ForeColor = MainMenuForm.fore;
		Model.BackColor = MainMenuForm.bkg;
		Buttons.BackColor = MainMenuForm.bkg;
		Values.BackColor = MainMenuForm.bkg;
		BackColor = MainMenuForm.bkg;
		Control[] bTN = BTN;
		foreach (Control size in bTN)
		{
			SetSize(size);
		}
		Font font = new Font(Sensor1.Font.FontFamily, 42 * SystemInformation.WorkingArea.Size.Width / 1920, FontStyle.Bold);
		label2.Font = font;
		label2.Top = Logo.Top + Logo.Height + 10;
		label2.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - label2.CreateGraphics().MeasureString(label2.Text, font).Width) / 2;
		Model.BringToFront();
		Model.Font = font;
		Model.Top = ImgCar.Top;
		Model.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - Model.CreateGraphics().MeasureString(Model.Text, font).Width) / 2;
		Control[] valSens = ValSens;
		foreach (Control control in valSens)
		{
			control.BackColor = MainMenuForm.bkg;
			control.Font = font;
			if (control.Name.IndexOf("Sensor") == -1)
			{
				control.Text = "";
			}
			if (control is Button)
			{
				((Button)control).FlatAppearance.BorderColor = MainMenuForm.bkg;
			}
		}
		Back.FlatAppearance.BorderColor = MainMenuForm.bkg;
		Print.FlatAppearance.BorderColor = MainMenuForm.bkg;
		Bleeding.FlatAppearance.BorderColor = MainMenuForm.bkg;
		Buttons.Top = 0;
		Buttons.Left = 0;
		Buttons.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.255);
		Buttons.Height = SystemInformation.WorkingArea.Size.Height;
		Values.Top = 0;
		Values.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.255);
		Values.Height = SystemInformation.WorkingArea.Size.Height;
		Values.Left = SystemInformation.WorkingArea.Size.Width - Values.Width + 10;
		double num = (SystemInformation.WorkingArea.Size.Height - 20) / BTN.Length;
		double num2 = SystemInformation.WorkingArea.Size.Height / BTN.Length;
		double num3 = 0.0;
		Control[] bTN2 = BTN;
		double num4;
		foreach (Control control2 in bTN2)
		{
			control2.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
			control2.Height = (int)num;
			num4 = num2 * num3++;
			control2.Top = (int)num4;
			control2.Left = 0;
		}
		num3 = 0.0;
		Control[] valSens2 = ValSens;
		foreach (Control control3 in valSens2)
		{
			control3.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
			control3.Height = (int)num;
			num4 = num2 * num3++;
			control3.Top = (int)num4;
			control3.Left = 0;
		}
		num4 = num2 * num3++;
		Back.Top = (int)num4;
		Back.Left = 0;
		btnResponse.Left = Values.Left - btnResponse.Width - 10;
		btnResponse.Top = Back.Top + Back.Height / 2 + 10;
		btnResponse.Visible = MainMenuForm.User;
		Back.Font = font;
		Back.Height = (int)num;
		Back.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
		Print.Font = font;
		Print.Height = (int)num;
		Print.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
		Print.Top = Back.Top;
		Print.Left = (SystemInformation.WorkingArea.Size.Width - Print.Width) / 2;
		Bleeding.Font = font;
		Bleeding.Height = (int)num;
		Bleeding.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
		Bleeding.Top = Back.Top;
		Bleeding.Left = 0;
		BatteryVoltage.BackgroundImage = new Bitmap("Buttons\\Battery Voltage.jpg");
		KeyPower.BackgroundImage = new Bitmap("Buttons\\Key Power.jpg");
		MotorTest.BackgroundImage = new Bitmap("Buttons\\Motor test.jpg");
		WheelLockTest.BackgroundImage = new Bitmap("Buttons\\Whell lock test.jpg");
		ValveTest.BackgroundImage = new Bitmap("Buttons\\Valve test.jpg");
		SpeedTest.BackgroundImage = new Bitmap("Buttons\\Speed test.jpg");
		BreakTest.BackgroundImage = new Bitmap("Buttons\\Break test.jpg");
		Voltometer.BackgroundImage = new Bitmap("Buttons\\Voltometer.jpg");
		Current.BackgroundImage = new Bitmap("Buttons\\Amperometer.jpg");
		Comunication.BackgroundImage = new Bitmap("Buttons\\Comunication.jpg");
		Sensor1.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor2.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor3.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor4.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Back.BackgroundImage = new Bitmap("Buttons\\Back.jpg");
		Print.BackgroundImage = new Bitmap("Buttons\\Print.jpg");
		Bleeding.BackgroundImage = new Bitmap("Buttons\\Bleeding.jpg");
		Frequeza.Top += 10;
		label1.Top = Frequeza.Top - 15;
	}

	private double SetSpeed(Control b, string text, double spd)
	{
		if (b.ForeColor == SystemColors.Control && SpeedTest.ForeColor == SystemColors.Control && BreakTest.ForeColor == SystemColors.Control && WheelLockTest.ForeColor == SystemColors.Control)
		{
			spd *= Car.BreakSpeed;
		}
		if (MetriSec == 1.0)
		{
			b.Text = text + (spd / MetriSec).ToString("###0.0 K/h");
		}
		else
		{
			b.Text = text + (spd / MetriSec).ToString("###0.0 m/s");
		}
		return spd;
	}

	private void SetSize(Control b)
	{
		b.BackColor = MainMenuForm.bkg;
		float num = 42 * SystemInformation.WorkingArea.Size.Width / 1920;
		double num2 = (double)SystemInformation.WorkingArea.Size.Width * 0.205;
		float num3;
		do
		{
			Font font = (b.Font = new Font(Sensor1.Font.FontFamily, num * (float)SystemInformation.WorkingArea.Size.Width / 1920f, FontStyle.Bold));
			num -= 0.25f;
			num3 = b.CreateGraphics().MeasureString(b.Text, font).Width;
		}
		while ((double)num3 >= num2);
		if (b is Button)
		{
			((Button)b).FlatAppearance.BorderColor = MainMenuForm.bkg;
		}
	}

	private void InviaComando(sbyte com, string cmd)
	{
		try
		{
			if (com > -1 && com < 3)
			{
				if (!MainMenuForm.COM[com].IsOpen)
				{
					MainMenuForm.COM[com].Open();
				}
				if (ErrorCom[com])
				{
					Polling.Stop();
					Sistem.Delay(1000.0);
					Polling.Start();
				}
				foreach (COMMAND item in BufferTx)
				{
				}
				BufferTx.Enqueue(new COMMAND(com, "\u0002" + cmd));
			}
			if (com == 3)
			{
				BufferTx.Enqueue(new COMMAND(com, cmd));
			}
		}
		catch (IOException)
		{
			if (com > -1)
			{
				ErrorCom[com] = true;
				if (MainMenuForm.TestHydraulic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
		catch (InvalidOperationException)
		{
			if (com > -1)
			{
				ErrorCom[com] = true;
				if (MainMenuForm.TestHydraulic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
		catch (UnauthorizedAccessException)
		{
			if (com > -1)
			{
				ErrorCom[com] = true;
				if (MainMenuForm.TestHydraulic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == com && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
		finally
		{
			Read.Enabled = true;
			Polling.Enabled = true;
		}
	}

	public void Handle_DataReceived(sbyte n)
	{
		char c = '\0';
		while (MainMenuForm.BufferRx[n].Count > 0)
		{
			c = MainMenuForm.BufferRx[n].Dequeue();
			if (c != '\r' && c != '\n')
			{
				MainMenuForm.DataUart[n] += c;
			}
			else
			{
				if (c == '\n' || c != '\r')
				{
					continue;
				}
				if (Frame == MainMenuForm.DataUart[n])
				{
					c = '\0';
				}
				Frame = MainMenuForm.DataUart[n];
				if (MainMenuForm.DataUart[n].Split(':').Length >= 2)
				{
					MainMenuForm.Value[n] = MainMenuForm.DataUart[n].Split(':')[1];
				}
				MainMenuForm.DataUart[n] = MainMenuForm.DataUart[n].Split(':')[0];
				switch (MainMenuForm.DataUart[n])
				{
				case "Hydraulics":
					InviaComando(MainMenuForm.TestHydraulic, "ACK Hydraulics");
					break;
				case "Status":
					InviaComando(MainMenuForm.TestHydraulic, "DISABLESTATUS");
					break;
				case "OK":
				case "BreakSpeed":
					Polling.Stop();
					if (ProgressBar != null)
					{
						ErrorCom[n] = false;
					}
					ControlComunication[2] = (byte)0;
					if (BufferTx.Count > 0)
					{
						BufferTx.Dequeue();
					}
					Polling_Tick(null, null);
					ResponseCom.BackColor = Color.Lime;
					ErrorCom[n] = false;
					if (!ErrorCom[0] && !ErrorCom[1])
					{
						label2.ForeColor = SystemColors.ControlText;
					}
					Polling.Start();
					break;
				case "Electronics":
					BufferTx.Enqueue(new COMMAND(MainMenuForm.TestElectronic, "ACK Electronics"));
					break;
				case "Volt":
					if (double.TryParse(MainMenuForm.Value[n], NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Voltage))
					{
						Voltage *= 0.0146484375;
						Voltometer.Text = Voltage.ToString("##0.0 V");
						Status[0] = Voltometer.Text;
					}
					break;
				case "Current":
				{
					if (double.TryParse(MainMenuForm.Value[n], NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
					{
						result *= 0.06103515625;
						Current.Text = result.ToString("##0.0 A");
						Status[1] = Current.Text;
						if (MaxCurrent < result)
						{
							MaxCurrent = result;
						}
					}
					break;
				}
				case "Comunication":
					Comunication.Text = "Comunication: " + MainMenuForm.Value[n];
					if (ResultComunication == "NO" && MainMenuForm.Value[n].IndexOf("None") == -1 && MainMenuForm.Value[n].IndexOf("Active") > -1)
					{
						ResultComunication = "YES";
					}
					if (KeyPower.ForeColor == SystemColors.Control && WaitComunication && MainMenuForm.Value[n] != "None")
					{
						StartTest();
					}
					Status[2] = MainMenuForm.Value[n];
					SetSize(Comunication);
					break;
				case "Frequency":
				{
					if (double.TryParse(MainMenuForm.Value[n].Replace(".", ",").Replace(":", ""), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result2))
					{
						result2 *= Coefficient;
						if (MaxSpeed < result2)
						{
							MaxSpeed = result2;
						}
						SpeedTest.Text = "SPEED TEST: " + result2.ToString("###0.0 K/h");
						Status[3] = result2.ToString("###0.0");
						Status[4] = SetSpeed(Sensor1, "FRONT LEFT: ", result2).ToString("###0.0");
						Status[5] = SetSpeed(Sensor2, "FRONT RIGHT: ", result2).ToString("###0.0");
						Status[6] = SetSpeed(Sensor3, "REAR LEFT: ", result2).ToString("###0.0");
						Status[7] = SetSpeed(Sensor4, "REAR RIGHT: ", result2).ToString("###0.0");
						SetSize(SpeedTest);
						SetSize(Sensor1);
						SetSize(Sensor2);
						SetSize(Sensor3);
						SetSize(Sensor4);
					}
					break;
				}
				case "Pressures":
					PressuresText.Add(Samples++, MainMenuForm.Value[n]);
					break;
				case "Check ok":
					Read.Start();
					InviaComando(MainMenuForm.TestElectronic, "Set ReleExt ON");
					break;
				case "Motor ok":
					MotorTest.ForeColor = SystemColors.ControlText;
					MessageBox.Show("Motor OK", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
					MotorOff.Enabled = EnableTurnOff;
					break;
				case "Motor error":
					MotorTest.ForeColor = SystemColors.ControlText;
					MessageBox.Show("Motor error", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					break;
				case "Motor off":
					MotorOff.Enabled = false;
					break;
				case "Information":
					ErrorConnection = 0;
					WaitResponse = true;
					IsElectronicConnected = true;
					break;
				case "Warning":
					if (MainMenuForm.Value[n].IndexOf("Bench is busy.") > -1)
					{
						ErrorConnection = 10;
						IsElectronicConnected = false;
						MessageBox.Show("Warning: " + MainMenuForm.Value[n], "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					}
					break;
				case "Memory Error":
					BufferTx.Clear();
					MessageBox.Show("Memory error!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					if (ProgressBar != null)
					{
						ProgressBar.Close();
						ProgressBar.Dispose();
						ProgressBar = null;
					}
					break;
				case "Buffer overwrite":
					MessageBox.Show("Buffer overwrite!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					break;
				case "Error":
					if (MainMenuForm.Value[n].IndexOf("Volt") > -1)
					{
						MessageBox.Show("Voltage too low!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
						BatteryVoltage.PerformClick();
						break;
					}
					BatteryVoltage.PerformClick();
					Read.Enabled = false;
					Polling.Enabled = false;
					KeyPower.Enabled = false;
					Application.DoEvents();
					MessageBox.Show("Error Code ABS!!!\r\n\r\nConnect the cable marked: [GRM" + (Car.Code - 2000).ToString().PadLeft(4, '0') + "]", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					break;
				default:
				{
					int num = 0;
					if (MainMenuForm.DataUart[n] != "")
					{
						num = 0;
					}
					break;
				}
				}
				if (MainMenuForm.DataUart[n].IndexOf("Volt") == -1 && MainMenuForm.DataUart[n].IndexOf("Current") == -1 && MainMenuForm.DataUart[n].IndexOf("Comunication") == -1 && MainMenuForm.DataUart[n].IndexOf("OK") == -1)
				{
					AddText(Frame + "\n");
				}
				MainMenuForm.DataUart[n] = "";
				MainMenuForm.Value[n] = "";
			}
		}
	}

	private void Select_CheckedChanged(object sender, EventArgs e)
	{
		RadioButton radioButton = (RadioButton)sender;
		string text = "Select OUT:";
		if (radioButton.Checked)
		{
			text += radioButton.Tag;
			InviaComando(MainMenuForm.TestElectronic, text);
		}
	}

	private void Frequeza_KeyDown(object sender, KeyEventArgs e)
	{
		Frequeza.Tag = Frequeza.Value;
	}

	private void Frequeza_KeyUp(object sender, KeyEventArgs e)
	{
		if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "SETSPEED?Speed=" + Frequeza.Value);
			Frequeza.Value = (int)Frequeza.Tag;
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			if (HTTPReponse)
			{
				Frequeza.Value = (int)sender;
				label1.Text = "Frequency:" + Frequeza.Value + "Hz";
			}
			else
			{
				label1.Text = "Frequency:" + Frequeza.Value + "Hz";
				InviaComando(MainMenuForm.TestElectronic, label1.Text);
			}
		}
	}

	private void StartTest()
	{
		if (!TestEnable)
		{
			TestEnable = true;
			InviaComando(MainMenuForm.TestElectronic, "Start Test");
			if (Car.Type == 1)
			{
				InviaComando(MainMenuForm.TestElectronic, "Active");
			}
			else
			{
				InviaComando(MainMenuForm.TestElectronic, "Passive");
			}
			Control[] cANTest = CANTest;
			foreach (Control control in cANTest)
			{
				control.Enabled = true;
			}
		}
	}

	private void KeyPower_Click(object sender, EventArgs e)
	{
		if (KeyPower.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "KEYPOWER?State=ON");
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				Read.Stop();
				BatteryVoltage.Enabled = false;
				InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
				bool flag = StartABS();
				FillTable();
				if (!WaitComunication || flag)
				{
					StartTest();
				}
				KeyPower.ForeColor = SystemColors.Control;
				Polling_Tick(null, null);
			}
		}
		else
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "KEYPOWER?State=OFF");
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				TestEnable = false;
				BatteryVoltage.Enabled = true;
				InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
				InviaComando(MainMenuForm.TestElectronic, "Stop Test");
				Control[] cANTest = CANTest;
				foreach (Control control in cANTest)
				{
					control.Enabled = false;
				}
				KeyPower.ForeColor = SystemColors.ControlText;
			}
		}
		Control[] cANTest2 = CANTest;
		foreach (Control control2 in cANTest2)
		{
			control2.ForeColor = SystemColors.ControlText;
		}
	}

	private void BatteryVoltage_Click(object sender, EventArgs e)
	{
		if (Comunication.Text.IndexOf("None") == -1 && Comunication.Text.Replace("Comunication", "").Length > 3 && MessageBox.Show("Disable the ABS\r\n\r\nClose Anyway?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.No)
		{
			return;
		}
		if (BatteryVoltage.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "BATTERY?State=ON");
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				Read.Stop();
				BatteryVoltage.ForeColor = SystemColors.Control;
				InviaComando(MainMenuForm.TestElectronic, "Check Code");
				KeyPower.Enabled = true;
				ResultComunication = "NO";
				Control[] cANTest = CANTest;
				foreach (Control control in cANTest)
				{
					control.Enabled = KeyPower.ForeColor == SystemColors.Control;
				}
			}
		}
		else
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "BATTERY?State=OFF");
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				if (KeyPower.BackColor == SystemColors.Control)
				{
					return;
				}
				TestEnable = false;
				Response = "";
				InviaComando(MainMenuForm.TestElectronic, "Set ReleExt OFF");
				InviaComando(MainMenuForm.TestElectronic, "Frequency:0Hz");
				InviaComando(MainMenuForm.TestElectronic, "Select OUT:0");
				InviaComando(MainMenuForm.TestElectronic, "Passive");
				BatteryVoltage.ForeColor = SystemColors.ControlText;
				KeyPower.Enabled = false;
				Control[] cANTest2 = CANTest;
				foreach (Control control2 in cANTest2)
				{
					control2.Enabled = false;
				}
			}
		}
		KeyPower.ForeColor = SystemColors.ControlText;
		Control[] cANTest3 = CANTest;
		foreach (Control control3 in cANTest3)
		{
			control3.ForeColor = SystemColors.ControlText;
		}
	}

	private void SpeedTest_Click(object sender, EventArgs e)
	{
		if (SpeedTest.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "SPEEDTEST?State=ON");
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				SpeedTest.ForeColor = SystemColors.Control;
				Release = 0;
				MaxSpeed = 0.0;
				MaxCurrent = 0.0;
				Control[] wheel = Wheel;
				foreach (Control control in wheel)
				{
					control.Enabled = true;
				}
				InviaComando(MainMenuForm.TestElectronic, "Select OUT:" + Car.Signal);
				TestSpeed = 69.0;
				PressuresText.Clear();
				SpeedTimer.Enabled = true;
				if (Car.Type == 1)
				{
					InviaComando(MainMenuForm.TestElectronic, "Active");
				}
				else
				{
					InviaComando(MainMenuForm.TestElectronic, "Passive");
				}
				NumberReport.State = true;
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "SPEEDTEST?State=OFF");
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			SpeedTest.ForeColor = SystemColors.ControlText;
			Control[] wheel2 = Wheel;
			foreach (Control control2 in wheel2)
			{
				control2.Enabled = false;
				control2.ForeColor = SystemColors.ControlText;
			}
			Bitmap image = new Bitmap("Car\\Wheel0.jpg");
			ImgCar.Image = image;
			SpeedTimer.Enabled = false;
		}
	}

	private void SpeedTimer_Tick(object sender, EventArgs e)
	{
		double num = 3.0;
		SpeedTimer.Enabled = false;
		if (MaxSpeed > TestSpeed)
		{
			if (WheelLockTest.ForeColor == SystemColors.ControlText)
			{
				Samples = 0;
				WheelTest = 0;
				WheelLockTest_Click(sender, e);
				Sistem.Delay(500.0);
				BreakTest_Click(sender, e);
				Sistem.Delay(500.0);
				Velocita -= num;
				InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / MetriSec / Coefficient) + "Hz");
				Sistem.Delay(1000.0);
				while (ErrorCom[MainMenuForm.TestElectronic] || (MainMenuForm.TestHydraulic > -1 && ErrorCom[MainMenuForm.TestHydraulic]))
				{
					Application.DoEvents();
				}
				Sensor_Click(Wheel[WheelTest], e);
				Velocita -= num;
				InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / MetriSec / Coefficient) + "Hz");
				TestSpeed = 0.0;
			}
			else
			{
				if (WheelTest < 4)
				{
					Sensor_Click(Wheel[WheelTest++], e);
				}
				if (Release == 1)
				{
					Release++;
					if (IsElectronicConnected)
					{
						InviaComando(MainMenuForm.TestHydraulic, "RELEASE");
					}
				}
				if (WheelTest == 4)
				{
					Velocita -= num;
					InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / MetriSec / Coefficient) + "Hz");
					if (Release == 0)
					{
						Release++;
					}
				}
				else
				{
					Sensor_Click(Wheel[WheelTest], e);
					Velocita -= num;
					InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / MetriSec / Coefficient) + "Hz");
				}
			}
		}
		else
		{
			if (BreakTest.ForeColor == SystemColors.Control)
			{
				num *= -1.0;
			}
			Velocita += num;
			if (Velocita < 0.0)
			{
				Velocita = 0.0;
			}
			InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / MetriSec / Coefficient) + "Hz");
		}
		if (BreakTest.ForeColor == SystemColors.Control && WheelLockTest.ForeColor == SystemColors.Control)
		{
			Control[] wheel = Wheel;
			foreach (Control control in wheel)
			{
				if (control.ForeColor == SystemColors.Control)
				{
					while (ErrorCom[MainMenuForm.TestElectronic] || (MainMenuForm.TestHydraulic > -1 && ErrorCom[MainMenuForm.TestHydraulic]))
					{
						Application.DoEvents();
					}
					Sistem.Delay(1000.0);
					InviaComando(MainMenuForm.TestElectronic, "Wheel Stop:" + control.Tag);
					for (int j = 0; j < 4; j++)
					{
						Sistem.Delay(1000.0);
						if (IsElectronicConnected)
						{
							InviaComando(MainMenuForm.TestHydraulic, "GETPRESSURE");
						}
					}
				}
				else
				{
					InviaComando(MainMenuForm.TestElectronic, "Wheel Go:" + control.Tag);
				}
			}
		}
		SpeedTimer.Enabled = Velocita > 0.0;
		if (SpeedTimer.Enabled)
		{
			return;
		}
		BreakTest_Click(sender, e);
		Sistem.Delay(2000.0);
		DateTime now = DateTime.Now;
		while (((MainMenuForm.TestElectronic > -1 && ErrorCom[MainMenuForm.TestElectronic]) || (MainMenuForm.TestHydraulic > -1 && ErrorCom[MainMenuForm.TestHydraulic])) && DateTime.Now.Subtract(now).TotalSeconds < 5.0)
		{
			Application.DoEvents();
		}
		WheelLockTest_Click(sender, e);
		SpeedTest_Click(sender, e);
		if (MainMenuForm.TestHydraulic <= -1)
		{
			return;
		}
		FormReport formReport = new FormReport(enableprinter: false);
		int num2 = 0;
		int num3 = 0;
		int num4 = 0;
		for (int k = 0; k < PressuresText.Count; k++)
		{
			string text = PressuresText[k];
			string[] array = text.Substring(0, text.Length - 2).Split(';');
			string[] array2 = array;
			foreach (string text2 in array2)
			{
				RichTextBox report = formReport.Report;
				report.Text = report.Text + text2 + " - ";
				if (num4 >= 1 && num4 < 17)
				{
					int num5 = num3 / 4;
					int num6 = num3 % 4;
					num3++;
					Pressures[num5, num6] = double.Parse(text2.Replace(".", ",").Replace(":", ""), MainMenuForm.Culture);
					num2 = num5 / 4;
					Pressure[num2, num6] += double.Parse(text2.Replace(".", ",").Replace(":", ""), MainMenuForm.Culture);
				}
			}
			formReport.Report.Text = formReport.Report.Text.Substring(0, formReport.Report.Text.Length - 3);
			formReport.Report.Text += "\r\n";
			if (num4++ % 4 == 0)
			{
				formReport.Report.Text += "\r\n";
			}
		}
		for (num2 = 0; num2 < 4; num2++)
		{
			for (int num6 = 0; num6 < 4; num6++)
			{
				Pressure[num2, num6] /= 4.0;
				Pressure[num2, num6] = Math.Abs(Pressure[num2, num6]);
			}
		}
		if (MainMenuForm.User)
		{
			formReport.ShowDialog();
		}
		formReport.Dispose();
		formReport = null;
	}

	private void BreakTest_Click(object sender, EventArgs e)
	{
		if (BreakTest.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "BREAKTEST?State=ON");
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				BreakTest.ForeColor = SystemColors.Control;
				InviaComando(MainMenuForm.TestElectronic, "Push");
				if (IsElectronicConnected)
				{
					InviaComando(MainMenuForm.TestHydraulic, "PUSH");
				}
				if (SpeedTest.ForeColor == SystemColors.ControlText)
				{
					Velocita = 0.0;
					InviaComando(MainMenuForm.TestElectronic, "Frequency:" + (short)(Velocita / Coefficient) + "Hz");
				}
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "BREAKTEST?State=OFF");
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			InviaComando(MainMenuForm.TestElectronic, "Release");
			Sistem.Delay(1000.0);
			BreakTest.ForeColor = SystemColors.ControlText;
		}
	}

	private void MotorOff_Tick(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Turn Off Motor");
	}

	private void AddText(string text)
	{
		if (Terminal == null)
		{
			return;
		}
		try
		{
			if (Terminal.Report.Text.IndexOf(text) <= -1 || text.Length > 3)
			{
			}
			Terminal.Report.Text += text;
			Terminal.Report.SelectionStart = Terminal.Report.TextLength;
			Terminal.Report.ScrollToCaret();
		}
		catch
		{
		}
	}

	private void btnResponse_Click(object sender, EventArgs e)
	{
		Terminal = new FormReport(enableprinter: false);
		Terminal.FormClosed += Form_FormClosed;
		Terminal.TopMost = true;
		Terminal.Show();
	}

	private void Form_FormClosed(object sender, FormClosedEventArgs e)
	{
		Form form = sender as Form;
		form.Dispose();
		form = null;
	}

	private void Bleeding_Click(object sender, EventArgs e)
	{
		if (IsElectronicConnected)
		{
			InviaComando(MainMenuForm.TestHydraulic, "PURGE");
		}
	}

	private void Polling_Tick(object sender, EventArgs e)
	{
		COMMAND cOMMAND = new COMMAND(-1, "");
		if (MainMenuForm.TestElectronic == -1)
		{
			return;
		}
		if (MainMenuForm.User)
		{
			ResponseCom.Text = BufferTx.Count.ToString();
		}
		try
		{
			if (MainMenuForm.TestHydraulic > -1)
			{
				if (!IsElectronicConnected)
				{
					if (ErrorConnection++ <= 7)
					{
						MainMenuForm.COM[MainMenuForm.TestHydraulic].WriteLine("ELECTRONIC");
						return;
					}
					ReleaseElectronic(forced: true);
				}
				else if (ErrorConnection > 7)
				{
					ReleaseElectronic(forced: true);
				}
			}
			if (BufferTx.Count <= 0)
			{
				return;
			}
			cOMMAND = BufferTx.Peek();
			byte b = (byte)ControlComunication[2];
			if (sender != null && ControlComunication[0].ToString() == cOMMAND.CMD && BufferTx.Count >= (int)ControlComunication[1])
			{
				b++;
				if (b > 3)
				{
					Read.Stop();
					Polling.Stop();
					MessageBox.Show("The card is not responding!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					if (ProgressBar != null)
					{
						ProgressBar.Close();
						ProgressBar.Dispose();
						ProgressBar = null;
					}
					return;
				}
			}
			else
			{
				b = 0;
			}
			ControlComunication[0] = cOMMAND.CMD;
			ControlComunication[1] = BufferTx.Count;
			ControlComunication[2] = b;
			if (MainMenuForm.TestElectronic <= -1 || cOMMAND.COM <= -1)
			{
				return;
			}
			ResponseCom.BackColor = Color.Red;
			Application.DoEvents();
			MainMenuForm.COM[cOMMAND.COM].WriteLine(cOMMAND.CMD);
			if (ProgressBar != null)
			{
				Read.Stop();
				if (b == 0)
				{
					ProgressBar.Status.Value++;
				}
				if (ProgressBar.Status.Value == ProgressBar.Status.Maximum)
				{
					ProgressBar.Close();
					ProgressBar.Dispose();
					ProgressBar = null;
					Read.Start();
				}
			}
		}
		catch (IOException)
		{
			if (cOMMAND.COM > -1)
			{
				ErrorCom[cOMMAND.COM] = true;
				if (MainMenuForm.TestHydraulic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
		catch (InvalidOperationException)
		{
			if (cOMMAND.COM > -1)
			{
				ErrorCom[cOMMAND.COM] = true;
				if (MainMenuForm.TestHydraulic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
		catch (UnauthorizedAccessException)
		{
			if (cOMMAND.COM > -1)
			{
				ErrorCom[cOMMAND.COM] = true;
				if (MainMenuForm.TestHydraulic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.DarkViolet;
				}
				if (MainMenuForm.TestElectronic == cOMMAND.COM && MainMenuForm.User)
				{
					label2.ForeColor = Color.Red;
				}
			}
		}
	}

	private void Read_Tick(object sender, EventArgs e)
	{
		if (MainMenuForm.TestElectronic > -1)
		{
			COMMAND cOMMAND = new COMMAND(-1, "");
			if (BufferTx.Count > 0)
			{
				cOMMAND = BufferTx.Peek();
			}
			InviaComando(MainMenuForm.TestElectronic, "Volt");
			InviaComando(MainMenuForm.TestElectronic, "Current");
			InviaComando(MainMenuForm.TestElectronic, "Comunication");
		}
		else
		{
			InviaComando(3, "Status");
		}
	}

	private void MotorTest_Click(object sender, EventArgs e)
	{
		Button button = (Button)sender;
		if (button.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				if (MotorTest.Equals(button))
				{
					InviaComando(3, "MOTORTEST?State=ON");
				}
				if (ValveTest.Equals(button))
				{
					InviaComando(3, "VALVETEST?State=ON");
				}
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				button.ForeColor = SystemColors.Control;
				InviaComando(MainMenuForm.TestElectronic, "Motor Test Enable");
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			if (MotorTest.Equals(button))
			{
				InviaComando(3, "MOTORTEST?State=OFF");
			}
			if (ValveTest.Equals(button))
			{
				InviaComando(3, "VALVETEST?State=OFF");
			}
		}
		else if (MainMenuForm.TestElectronic <= -1 && !HTTPReponse)
		{
		}
	}

	private bool StartABS()
	{
		TableBase.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 3 ORDER BY [Order]";
		adapter.Fill(TableBase);
		if (TableBase.Rows.Count > 0)
		{
			Sistem.Delay(1000.0);
			BaseDataCAN.Clear();
			foreach (DataRow row in TableBase.Rows)
			{
				FRAME fRAME = new FRAME();
				fRAME.address1 = row["Address1"].ToString();
				fRAME.indx = short.Parse(row["Order"].ToString());
				fRAME.us = short.Parse(row["Delay"].ToString());
				fRAME.data = new List<byte>();
				for (int i = 1; i < 9; i++)
				{
					if (row["D" + i] != DBNull.Value)
					{
						fRAME.data.Add(byte.Parse(row["D" + i].ToString()));
					}
				}
				fRAME.type = 0;
				BaseDataCAN.Enqueue(fRAME);
			}
			JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
			while (BaseDataCAN.Count > 0)
			{
				FRAME fRAME = BaseDataCAN.Dequeue();
				string cmd = javaScriptSerializer.Serialize(fRAME);
				InviaComando(MainMenuForm.TestElectronic, cmd);
			}
			InviaComando(MainMenuForm.TestElectronic, "Start ABS");
			if (BufferTx.Count > 0)
			{
				ProgressBar = new Progress();
				ProgressBar.Status.Maximum = BufferTx.Count;
				ProgressBar.ShowDialog();
			}
			Sistem.Delay(2000.0);
			return true;
		}
		return false;
	}

	private void FillTable()
	{
		FRAME fRAME = new FRAME();
		JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
		TableMotor.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 1 ORDER BY [Order]";
		adapter.Fill(TableMotor);
		MotorDataCAN.Clear();
		foreach (DataRow row in TableMotor.Rows)
		{
			fRAME = new FRAME();
			fRAME.address1 = row["Address1"].ToString();
			fRAME.indx = (short)(int.Parse(row["Order"].ToString()) + BaseDataCAN.Count);
			fRAME.data = new List<byte>();
			fRAME.us = short.Parse(row["Delay"].ToString());
			for (int i = 1; i < 9; i++)
			{
				if (row["D" + i] != DBNull.Value)
				{
					fRAME.data.Add(byte.Parse(row["D" + i].ToString()));
				}
			}
			if (row["Type"] != DBNull.Value)
			{
				fRAME.type = (byte)row["Type"];
			}
			if (!EnableTurnOff)
			{
				EnableTurnOff = (byte)row["Type"] == 5;
			}
			MotorDataCAN.Enqueue(fRAME);
		}
		TableBase.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 0 ORDER BY [Order]";
		adapter.Fill(TableBase);
		if (TableMotor.Rows.Count - TableBase.Rows.Count > 2)
		{
			adapter.Fill(TableBase);
		}
		BaseDataCAN.Clear();
		foreach (DataRow row2 in TableBase.Rows)
		{
			fRAME = new FRAME();
			fRAME.address1 = row2["Address1"].ToString();
			fRAME.indx = short.Parse(row2["Order"].ToString());
			fRAME.data = new List<byte>();
			fRAME.us = short.Parse(row2["Delay"].ToString());
			for (int j = 1; j < 9; j++)
			{
				if (row2["D" + j] != DBNull.Value)
				{
					fRAME.data.Add(byte.Parse(row2["D" + j].ToString()));
				}
			}
			if (row2["Type"] != DBNull.Value)
			{
				fRAME.type = (byte)row2["Type"];
			}
			BaseDataCAN.Enqueue(fRAME);
		}
		short num = 0;
		List<FRAME> list = new List<FRAME>();
		while (BaseDataCAN.Count > 0 && MotorDataCAN.Count > 0)
		{
			fRAME = ((num % 2 != 0) ? MotorDataCAN.Dequeue() : BaseDataCAN.Dequeue());
			fRAME.pos = num++;
			list.Add(fRAME);
		}
		while (BaseDataCAN.Count > 0)
		{
			fRAME = BaseDataCAN.Dequeue();
			fRAME.pos = num++;
			list.Add(fRAME);
		}
		while (MotorDataCAN.Count > 0)
		{
			fRAME = MotorDataCAN.Dequeue();
			fRAME.pos = num++;
			list.Add(fRAME);
		}
		if (list.Count <= 0)
		{
			return;
		}
		List<FRAME> list2 = new List<FRAME>();
		if (MainMenuForm.N_STRING > 1)
		{
			list[list.Count - 1].pos *= -1;
		}
		foreach (FRAME item in list)
		{
			list2.Add(item);
			if (list2.Count == MainMenuForm.N_STRING)
			{
				string cmd = ((MainMenuForm.N_STRING > 1) ? javaScriptSerializer.Serialize(list2.ToArray()) : javaScriptSerializer.Serialize(list2[0]));
				InviaComando(MainMenuForm.TestElectronic, cmd);
				list2.Clear();
			}
		}
		if (list2.Count > 0)
		{
			string cmd = javaScriptSerializer.Serialize(list2.ToArray());
			InviaComando(MainMenuForm.TestElectronic, cmd);
			list2.Clear();
		}
		if (BufferTx.Count > 0)
		{
			ProgressBar = new Progress();
			ProgressBar.Status.Maximum = BufferTx.Count;
			ProgressBar.ShowDialog();
		}
	}

	private void Model_Click(object sender, EventArgs e)
	{
		SelectModelForm selectModelForm = null;
		Cursor = Cursors.WaitCursor;
		EnableTurnOff = false;
		if (BatteryVoltage.ForeColor == SystemColors.Control)
		{
			MessageBox.Show("Disconnect Battery", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			Cursor = Cursors.Default;
			return;
		}
		Read.Stop();
		if (sender != null)
		{
			selectModelForm = new SelectModelForm(0);
		}
		if (sender == null || selectModelForm.ShowDialog() == DialogResult.OK)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, $"MODEL?ID={MainMenuForm.ID_Modello}&Model={MainMenuForm.NomeModello}");
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse || sender == null)
			{
				InviaComando(MainMenuForm.TestElectronic, "Stop Test");
				InviaComando(MainMenuForm.TestElectronic, "Frequency:0Hz");
				InviaComando(MainMenuForm.TestElectronic, "Select OUT:0");
				InviaComando(MainMenuForm.TestElectronic, "Passive");
				Car = null;
				Car = new ModelComponent();
				Car.Name = MainMenuForm.NomeModello;
				Buttons.Enabled = true;
				Model.Text = "Model: " + MainMenuForm.NomeModello;
				Model.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - Model.CreateGraphics().MeasureString(Model.Text, Model.Font).Width) / 2;
				Command.CommandText = "SELECT * FROM Modelli WHERE ID = " + MainMenuForm.ID_Modello;
				DataTable dataTable = new DataTable();
				adapter.Fill(dataTable);
				WaitComunication = bool.Parse(dataTable.Rows[0]["WaitComunication"].ToString());
				MotorTest.Visible = ((byte)dataTable.Rows[0]["Enable"] & 1) > 0;
				ValveTest.Visible = ((byte)dataTable.Rows[0]["Enable"] & 2) > 0;
				Car.Speed = sbyte.Parse(dataTable.Rows[0]["SpeedCAN"].ToString());
				Car.Type = Convert.ToByte(bool.Parse(dataTable.Rows[0]["Type"].ToString()));
				Car.Signal = byte.Parse(dataTable.Rows[0]["Signal"].ToString());
				Car.Spike = bool.Parse(dataTable.Rows[0]["Spike"].ToString());
				if (!short.TryParse(dataTable.Rows[0]["Code"].ToString(), out Car.Code))
				{
					Car.Code = 0;
				}
				if (!uint.TryParse(dataTable.Rows[0]["Pausa"].ToString(), out Car.Pausa))
				{
					Car.Pausa = 30u;
				}
				if (!double.TryParse(dataTable.Rows[0]["BreakSpeed"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.BreakSpeed))
				{
					Car.BreakSpeed = 0.7;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel1Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel1Res1))
				{
					Car.Wheel1Res1 = 1500.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel1Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel1Res2))
				{
					Car.Wheel1Res2 = 200.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel2Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel2Res1))
				{
					Car.Wheel2Res1 = Car.Wheel1Res1;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel2Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel2Res2))
				{
					Car.Wheel2Res2 = Car.Wheel1Res2;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel3Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel3Res1))
				{
					Car.Wheel3Res1 = Car.Wheel1Res1;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel3Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel3Res2))
				{
					Car.Wheel3Res2 = Car.Wheel1Res2;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel4Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel4Res1))
				{
					Car.Wheel4Res1 = Car.Wheel1Res1;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel4Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel4Res2))
				{
					Car.Wheel4Res2 = Car.Wheel1Res2;
				}
				if (double.TryParse(dataTable.Rows[0]["DeltaSpeed"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
				{
					Car.DeltaSpeed = result;
				}
				if (double.TryParse(dataTable.Rows[0]["Coefficient"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
				{
					Coefficient = result;
				}
				Car.Signal++;
				string text = dataTable.Rows[0]["Alfa1"].GetType().ToString();
				Car.Alfa1 = (double)dataTable.Rows[0]["Alfa1"];
				Car.Alfa2 = (double)dataTable.Rows[0]["Alfa2"];
				Car.Alfa3 = (double)dataTable.Rows[0]["Alfa3"];
				Car.Alfa4 = (double)dataTable.Rows[0]["Alfa4"];
				MotorOff.Interval = (int)Car.Pausa;
				Polling.Stop();
				MessageBox.Show("Connect the cable: [GRM" + (Car.Code - 2000).ToString().PadLeft(4, '0') + "]", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
				Polling.Start();
				int num = 400;
				JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
				string text2 = javaScriptSerializer.Serialize(Car).Replace("Name", "Model");
				if (MainMenuForm.N_STRING == 1)
				{
					int startIndex = text2.IndexOf("DeltaSpeed") - 2;
					text2 = text2.Substring(0, text2.IndexOf("Alfa1") - 2) + text2.Substring(startIndex);
					num = 350;
				}
				if (text2.Length >= num)
				{
					MessageBox.Show("Data too long!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					return;
				}
				InviaComando(MainMenuForm.TestElectronic, text2);
				MaxSpeed = 0.0;
			}
		}
		Cursor = Cursors.Default;
		Read.Start();
	}

	private void Sensor_Click(object sender, EventArgs e)
	{
		Button button = (Button)sender;
		byte[] array = new byte[4] { 1, 2, 4, 8 };
		byte b = 0;
		byte b2 = (byte)(byte.Parse(button.Tag.ToString()) + 1);
		if (button.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "SENSOR?State=ON&Wheel=" + b2);
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				button.ForeColor = SystemColors.Control;
			}
		}
		else
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "SENSOR?State=OFF&Wheel=" + b2);
				return;
			}
			if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				button.ForeColor = SystemColors.ControlText;
			}
		}
		for (byte b3 = 0; b3 < 4; b3++)
		{
			if (Wheel[b3].ForeColor == SystemColors.Control)
			{
				b += array[b3];
			}
			Bitmap image = new Bitmap("Car\\Wheel" + b + ".jpg");
			ImgCar.Image = image;
		}
	}

	private void WheelLockTest_Click(object sender, EventArgs e)
	{
		if (WheelLockTest.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "WHEELLOCKTEST?State=ON");
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				WheelLockTest.ForeColor = SystemColors.Control;
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "WHEELLOCKTEST?State=OFF");
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			WheelLockTest.ForeColor = SystemColors.ControlText;
		}
	}

	private void Print_Click(object sender, EventArgs e)
	{
		try
		{
			if (MainMenuForm.CardService != -1)
			{
				DataTable dataTable = ConnessioneAccess.FillTable("SELECT DISTINCT Serial, Department, CardService, Preventive FROM ListCarsService WHERE ID = " + MainMenuForm.CardService);
				CompilePrint.Operator.Text = MainMenuForm.Operator;
				if (dataTable.Rows[0]["Department"].ToString() == "0000000000000")
				{
					CompilePrint.InternalCode.Text = dataTable.Rows[0]["CardService"].ToString();
				}
				else
				{
					CompilePrint.InternalCode.Text = dataTable.Rows[0]["Preventive"].ToString();
				}
				CompilePrint.OEM_ABS.Text = dataTable.Rows[0]["Serial"].ToString();
			}
			if (CompilePrint.ShowDialog() != DialogResult.OK)
			{
				return;
			}
			if (CompilePrint.OEM_ABS.Text.Trim() == "")
			{
				CompilePrint.OEM_ABS.Text = Model.Text;
			}
			if (MainMenuForm.CardService != -1 || NumberReport.State)
			{
				if (DateTime.Now.Year == NumberReport.Data.Year && DateTime.Now.Month == NumberReport.Data.Month && DateTime.Now.Day == NumberReport.Data.Day)
				{
					NumberReport.Number++;
				}
				else
				{
					NumberReport.Number = 1;
				}
				NumberReport.Data = DateTime.Now;
				NumberReport.Model = CompilePrint.OEM_ABS.Text;
				NumberReport.State = false;
				CreaReport();
			}
			Printer.Print();
		}
		catch
		{
			MessageBox.Show("Print Error.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void CreaReport()
	{
		if (MainMenuForm.CardService > -1)
		{
			ReportE reportE = new ReportE();
			reportE.ID_CarsService = MainMenuForm.CardService;
			reportE.Number = NumberReport.Number;
			reportE.Data = NumberReport.Data;
			reportE.Operator = CompilePrint.Operator.Text;
			reportE.InternalCode = CompilePrint.InternalCode.Text;
			reportE.TypeOfTest = CompilePrint.TypeOfTest.Text;
			reportE.OEM_ABS = CompilePrint.OEM_ABS.Text;
			reportE.ISOCode = CompilePrint.ISOCode.Text;
			reportE.SoftwareVersion = CompilePrint.SoftwareVersion.Text;
			reportE.HardwareVersion = CompilePrint.HardwareVersion.Text;
			reportE.TechnicalNotes = CompilePrint.TechnicalNotes.Text;
			reportE.TestResult = CompilePrint.TestResult.Checked;
			reportE.CurrentPeak = MaxCurrent;
			double.TryParse(Voltometer.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out reportE.Voltage);
			reportE.Comunication = ResultComunication == "YES";
			reportE.FrontLeft1 = Pressure[0, 0];
			reportE.FrontLeft2 = Pressure[0, 1];
			reportE.FrontLeft3 = Pressure[0, 2];
			reportE.FrontLeft4 = Pressure[0, 3];
			reportE.FrontRight1 = Pressure[1, 0];
			reportE.FrontRight2 = Pressure[1, 1];
			reportE.FrontRight3 = Pressure[1, 2];
			reportE.FrontRight4 = Pressure[1, 3];
			reportE.RearLeft1 = Pressure[2, 0];
			reportE.RearLeft2 = Pressure[2, 1];
			reportE.RearLeft3 = Pressure[2, 2];
			reportE.RearLeft4 = Pressure[2, 3];
			reportE.RearRight1 = Pressure[3, 0];
			reportE.RearRight2 = Pressure[3, 1];
			reportE.RearRight3 = Pressure[3, 2];
			reportE.RearRight4 = Pressure[3, 3];
			JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
			string text = javaScriptSerializer.Serialize(reportE);
			FormConfig formConfig = new FormConfig();
			string uRL = $"http://{formConfig.IPServer.Text}:{formConfig.Port.Text}{formConfig.URLServer.Text}/AddReportE?Company={formConfig.UserName.Text}&CarsServiceID={MainMenuForm.CardService}&report={text}";
			BOARD.SendRequest(uRL);
			formConfig.Close();
			formConfig.Dispose();
			formConfig = null;
		}
		else
		{
			string contents = Serializer.Serialize(NumberReport);
			File.WriteAllText("Report.txt", contents);
		}
	}

	private void HTTP_Response(string response, string host)
	{
		try
		{
			Invoke(new Handle_Response(ResponseHTTP), response, host);
		}
		catch
		{
		}
	}

	private void ResponseHTTP(string response, string host)
	{
		if (response.IndexOf("successfull") > -1)
		{
			string contents = Serializer.Serialize(NumberReport);
			File.WriteAllText("Report.txt", contents);
		}
		else
		{
			MessageBox.Show("Error:\r\n\r\n" + response, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void Printer_BeginPrint(object sender, PrintEventArgs e)
	{
		if (Printer.IsPreview)
		{
			return;
		}
		SaveReportDialog.InitialDirectory = Directory.GetParent(Environment.GetFolderPath(Environment.SpecialFolder.Personal)).FullName + "\\Documents";
		if (Printer.PrinterName == "Microsoft Print to PDF")
		{
			SaveReportDialog.FileName = NumberReport.Model + " - " + NumberReport.Data.ToString("dd-MM-yyyy") + " - " + NumberReport.Number + ".pdf";
			if (SaveReportDialog.ShowDialog() == DialogResult.OK)
			{
				Printer.PrintFileName = SaveReportDialog.FileName;
				Printer.PrintToFile = true;
				Directory.SetCurrentDirectory(Application.StartupPath);
			}
			else
			{
				e.Cancel = true;
			}
		}
	}

	private void Printer_PrintPage(object sender, PrintPageEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Report report = new Report(NumberReport.Data, NumberReport.Number, NumberReport.Model, NumberReport.State);
		if (File.Exists("Logo1.jpg"))
		{
			ImgLogo = new Bitmap("Logo1.jpg");
		}
		else
		{
			ImgLogo = Resources.Logo;
		}
		RectangleF srcRect = new RectangleF(new Point(0, 0), ImgLogo.Size);
		Rectangle rectangle = new Rectangle(new Point(8, 7), new Size(70, 40));
		if (CompilePrint.InsertLOGO.Checked)
		{
			graphics.DrawImage(ImgLogo, rectangle, srcRect, GraphicsUnit.Pixel);
		}
		Font font = new Font(Sensor1.Font.FontFamily, 12f, FontStyle.Bold);
		Font font2 = new Font(FontFamily.GenericMonospace, 11f, FontStyle.Bold);
		Font font3 = new Font(Sensor1.Font.FontFamily, 17f, FontStyle.Bold);
		Font font4 = new Font(Sensor1.Font.FontFamily, 26f, FontStyle.Bold);
		Font font5 = new Font(Sensor1.Font.FontFamily, 11f, FontStyle.Bold);
		if (!report.State)
		{
			if (DateTime.Now.Year == report.Data.Year && DateTime.Now.Month == report.Data.Month && DateTime.Now.Day == report.Data.Day)
			{
				report.Number++;
			}
			else
			{
				report.Number = 1;
			}
			report.Data = DateTime.Now;
			report.Model = CompilePrint.OEM_ABS.Text;
			report.State = false;
		}
		int num = 0;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.05));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		string s = "Test Report: " + report.Model + " | " + report.Data.ToString("dd/MM/yyyy") + " | " + report.Number;
		float num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString(s, font3).Width) / 2f;
		graphics.DrawString(s, font3, Brushes.Black, new PointF(num2, num + 10));
		num += (int)((double)e.MarginBounds.Size.Height * 0.05);
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.08));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		graphics.DrawString("Test date                                " + DateTime.Now.ToString("dd/MM/yyyy HH:mm"), font5, Brushes.Black, new PointF(10f, num + 6));
		graphics.DrawString("Company                              " + Company, font5, Brushes.Black, new PointF(10f, num + 26));
		graphics.DrawString("Operator                              " + CompilePrint.Operator.Text, font5, Brushes.Black, new PointF(10f, num + 46));
		graphics.DrawString("Internal code                       " + CompilePrint.InternalCode.Text, font5, Brushes.Black, new PointF(10f, num + 66));
		graphics.DrawString("Type of test                " + CompilePrint.TypeOfTest.Text, font5, Brushes.Black, new PointF(450f, num + 6));
		num += (int)((double)e.MarginBounds.Size.Height * 0.08) + 20;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.06));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString("ABS", font3).Width) / 2f;
		num += (int)((double)e.MarginBounds.Size.Height * 0.03);
		num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString("ABS data", font3).Width) / 2f;
		graphics.DrawString("ABS data", font3, Brushes.Black, new PointF(num2, num - 10));
		num += (int)((double)e.MarginBounds.Size.Height * 0.03);
		rectangle = new Rectangle(0, num + 2, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.53));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		num += 10;
		graphics.DrawString("OEM ABS number    " + CompilePrint.OEM_ABS.Text, font2, Brushes.Black, new PointF(10f, num + 4));
		graphics.DrawString("ISO code          " + CompilePrint.ISOCode.Text, font2, Brushes.Black, new PointF(10f, num + 24));
		graphics.DrawString("Software version  " + CompilePrint.SoftwareVersion.Text, font2, Brushes.Black, new PointF(10f, num + 44));
		graphics.DrawString("Hardware version  " + CompilePrint.HardwareVersion.Text, font2, Brushes.Black, new PointF(10f, num + 64));
		int num3 = num;
		num3 += (int)((double)e.MarginBounds.Size.Height * 0.12);
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num3, e.MarginBounds.Size.Width, num3);
		graphics.DrawString("ABS speed test results at 70 Km/h (Bar)", font, Brushes.Black, new PointF(10f, num3 + 4));
		graphics.DrawString("Front Left  " + Pressure[0, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(10f, num3 + 28 + 20));
		graphics.DrawString("Front Right " + Pressure[1, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(10f, num3 + 50 + 20));
		graphics.DrawString("Rear Left   " + Pressure[2, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(10f, num3 + 72 + 20));
		graphics.DrawString("Rear Right  " + Pressure[3, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(10f, num3 + 94 + 20));
		graphics.DrawString(Pressure[0, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(200f, num3 + 28 + 20));
		graphics.DrawString(Pressure[1, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(200f, num3 + 50 + 20));
		graphics.DrawString(Pressure[2, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(200f, num3 + 72 + 20));
		graphics.DrawString(Pressure[3, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(200f, num3 + 94 + 20));
		graphics.DrawString(Pressure[0, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(280f, num3 + 28 + 20));
		graphics.DrawString(Pressure[1, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(280f, num3 + 50 + 20));
		graphics.DrawString(Pressure[2, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(280f, num3 + 72 + 20));
		graphics.DrawString(Pressure[3, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(280f, num3 + 94 + 20));
		graphics.DrawString(Pressure[0, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(360f, num3 + 28 + 20));
		graphics.DrawString(Pressure[1, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(360f, num3 + 50 + 20));
		graphics.DrawString(Pressure[2, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(360f, num3 + 72 + 20));
		graphics.DrawString(Pressure[3, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Black, new PointF(360f, num3 + 94 + 20));
		num3 += (int)((double)e.MarginBounds.Size.Height * 0.13);
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num3, e.MarginBounds.Size.Width, num3);
		graphics.DrawString("Absorted current peak  " + MaxCurrent.ToString("###0.0") + "A", font2, Brushes.Black, new PointF(10f, num3 + 14));
		graphics.DrawString("Voltage                " + Voltometer.Text.Replace(" ", ""), font2, Brushes.Black, new PointF(10f, num3 + 34));
		graphics.DrawString("Comunication           " + ResultComunication, font2, Brushes.Black, new PointF(10f, num3 + 54));
		num3 += (int)((double)e.MarginBounds.Size.Height * 0.08);
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num3, e.MarginBounds.Size.Width, num3);
		graphics.DrawString("NOTE", font3, Brushes.Black, new PointF(10f, num3 + 4));
		rectangle = new Rectangle(10, num3 + 34, e.MarginBounds.Size.Width - 20, (int)((double)e.MarginBounds.Size.Height * 0.155));
		graphics.DrawString(CompilePrint.TechnicalNotes.Text, font2, Brushes.Black, rectangle);
		num += (int)((double)e.MarginBounds.Size.Height * 0.53) + 20;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.03));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		string text = "";
		text = ((!CompilePrint.TestResult.Checked) ? (text + "Error") : (text + "Pass OK"));
		num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString(text, font3).Width) / 2f;
		graphics.DrawString(text, font3, Brushes.Black, new PointF(num2, num + 2));
	}

	private void Printer_EndPrint(object sender, PrintEventArgs e)
	{
		if (Printer.IsPreview)
		{
			return;
		}
		if (!NumberReport.State)
		{
			if (DateTime.Now.Year == NumberReport.Data.Year && DateTime.Now.Month == NumberReport.Data.Month && DateTime.Now.Day == NumberReport.Data.Day)
			{
				NumberReport.Number++;
			}
			else
			{
				NumberReport.Number = 1;
			}
			NumberReport.Data = DateTime.Now;
			NumberReport.Model = CompilePrint.OEM_ABS.Text;
			NumberReport.State = false;
			CreaReport();
			ResultComunication = "NO";
		}
		Printer.Close();
	}

	private void ABS_FormClosing(object sender, FormClosingEventArgs e)
	{
		Cursor = Cursors.WaitCursor;
		BOARD.EventHandlerResponse -= HTTP_Response;
		Read.Stop();
		Polling.Stop();
		SpeedTimer.Stop();
		Sistem.Delay(700.0);
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
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SC_F2_EVO.ABS));
		this.Back = new System.Windows.Forms.Button();
		this.BatteryVoltage = new System.Windows.Forms.Button();
		this.Buttons = new System.Windows.Forms.Panel();
		this.Bleeding = new System.Windows.Forms.Button();
		this.BreakTest = new System.Windows.Forms.Button();
		this.label1 = new System.Windows.Forms.Label();
		this.Frequeza = new System.Windows.Forms.TrackBar();
		this.SpeedTest = new System.Windows.Forms.Button();
		this.ValveTest = new System.Windows.Forms.Button();
		this.MotorTest = new System.Windows.Forms.Button();
		this.WheelLockTest = new System.Windows.Forms.Button();
		this.KeyPower = new System.Windows.Forms.Button();
		this.Values = new System.Windows.Forms.Panel();
		this.Comunication = new System.Windows.Forms.Button();
		this.Voltometer = new System.Windows.Forms.Button();
		this.Current = new System.Windows.Forms.Button();
		this.Sensor1 = new System.Windows.Forms.Button();
		this.Sensor2 = new System.Windows.Forms.Button();
		this.Sensor3 = new System.Windows.Forms.Button();
		this.Sensor4 = new System.Windows.Forms.Button();
		this.Model = new System.Windows.Forms.Label();
		this.Read = new System.Windows.Forms.Timer(this.components);
		this.Polling = new System.Windows.Forms.Timer(this.components);
		this.label2 = new System.Windows.Forms.Label();
		this.SpeedTimer = new System.Windows.Forms.Timer(this.components);
		this.Print = new System.Windows.Forms.Button();
		this.btnResponse = new System.Windows.Forms.Button();
		this.MotorOff = new System.Windows.Forms.Timer(this.components);
		this.ResponseCom = new System.Windows.Forms.Label();
		this.SaveReportDialog = new System.Windows.Forms.SaveFileDialog();
		this.Logo = new System.Windows.Forms.PictureBox();
		this.ImgCar = new System.Windows.Forms.PictureBox();
		this.Buttons.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequeza).BeginInit();
		this.Values.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Logo).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.ImgCar).BeginInit();
		base.SuspendLayout();
		this.Back.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Back.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Back.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Back.FlatAppearance.BorderSize = 3;
		this.Back.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Back.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Back.Location = new System.Drawing.Point(198, 588);
		this.Back.Name = "Back";
		this.Back.Size = new System.Drawing.Size(148, 58);
		this.Back.TabIndex = 20;
		this.Back.Text = "Back";
		this.Back.Click += new System.EventHandler(Close_Click);
		this.BatteryVoltage.Anchor = System.Windows.Forms.AnchorStyles.None;
		this.BatteryVoltage.AutoSize = true;
		this.BatteryVoltage.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.BatteryVoltage.Cursor = System.Windows.Forms.Cursors.Hand;
		this.BatteryVoltage.FlatAppearance.BorderSize = 3;
		this.BatteryVoltage.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.BatteryVoltage.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.BatteryVoltage.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.BatteryVoltage.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.BatteryVoltage.Location = new System.Drawing.Point(21, 22);
		this.BatteryVoltage.Name = "BatteryVoltage";
		this.BatteryVoltage.Size = new System.Drawing.Size(248, 60);
		this.BatteryVoltage.TabIndex = 0;
		this.BatteryVoltage.Text = "BATTERY VOLTAGE";
		this.BatteryVoltage.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.BatteryVoltage.UseVisualStyleBackColor = true;
		this.BatteryVoltage.Click += new System.EventHandler(BatteryVoltage_Click);
		this.Buttons.BackColor = System.Drawing.SystemColors.Control;
		this.Buttons.Controls.Add(this.Bleeding);
		this.Buttons.Controls.Add(this.BreakTest);
		this.Buttons.Controls.Add(this.label1);
		this.Buttons.Controls.Add(this.Frequeza);
		this.Buttons.Controls.Add(this.SpeedTest);
		this.Buttons.Controls.Add(this.ValveTest);
		this.Buttons.Controls.Add(this.MotorTest);
		this.Buttons.Controls.Add(this.WheelLockTest);
		this.Buttons.Controls.Add(this.KeyPower);
		this.Buttons.Controls.Add(this.BatteryVoltage);
		this.Buttons.Enabled = false;
		this.Buttons.Location = new System.Drawing.Point(0, 0);
		this.Buttons.Name = "Buttons";
		this.Buttons.Size = new System.Drawing.Size(260, 684);
		this.Buttons.TabIndex = 3;
		this.Bleeding.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Bleeding.AutoSize = true;
		this.Bleeding.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Bleeding.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Bleeding.FlatAppearance.BorderSize = 3;
		this.Bleeding.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.Bleeding.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.Bleeding.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.Bleeding.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Bleeding.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.Bleeding.Location = new System.Drawing.Point(21, 608);
		this.Bleeding.Name = "Bleeding";
		this.Bleeding.Size = new System.Drawing.Size(219, 58);
		this.Bleeding.TabIndex = 9;
		this.Bleeding.Text = "BLEEDING";
		this.Bleeding.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.Bleeding.UseVisualStyleBackColor = true;
		this.Bleeding.Visible = false;
		this.Bleeding.Click += new System.EventHandler(Bleeding_Click);
		this.BreakTest.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.BreakTest.AutoSize = true;
		this.BreakTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.BreakTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.BreakTest.FlatAppearance.BorderSize = 3;
		this.BreakTest.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.BreakTest.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.BreakTest.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.BreakTest.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.BreakTest.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.BreakTest.Location = new System.Drawing.Point(21, 344);
		this.BreakTest.Name = "BreakTest";
		this.BreakTest.Size = new System.Drawing.Size(219, 58);
		this.BreakTest.TabIndex = 6;
		this.BreakTest.Text = "BRAKE TEST";
		this.BreakTest.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.BreakTest.UseVisualStyleBackColor = true;
		this.BreakTest.Click += new System.EventHandler(BreakTest_Click);
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.label1.Location = new System.Drawing.Point(77, 496);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(71, 16);
		this.label1.TabIndex = 7;
		this.label1.Text = "Frequency";
		this.label1.Visible = false;
		this.Frequeza.Location = new System.Drawing.Point(15, 515);
		this.Frequeza.Maximum = 2000;
		this.Frequeza.Name = "Frequeza";
		this.Frequeza.Size = new System.Drawing.Size(226, 45);
		this.Frequeza.TabIndex = 8;
		this.Frequeza.Visible = false;
		this.Frequeza.KeyDown += new System.Windows.Forms.KeyEventHandler(Frequeza_KeyDown);
		this.Frequeza.KeyUp += new System.Windows.Forms.KeyEventHandler(Frequeza_KeyUp);
		this.SpeedTest.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.SpeedTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.SpeedTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.SpeedTest.FlatAppearance.BorderSize = 3;
		this.SpeedTest.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.SpeedTest.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.SpeedTest.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.SpeedTest.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.SpeedTest.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.SpeedTest.Location = new System.Drawing.Point(21, 280);
		this.SpeedTest.Name = "SpeedTest";
		this.SpeedTest.Size = new System.Drawing.Size(219, 58);
		this.SpeedTest.TabIndex = 4;
		this.SpeedTest.Tag = "3";
		this.SpeedTest.Text = "SPEED TEST";
		this.SpeedTest.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.SpeedTest.UseVisualStyleBackColor = true;
		this.SpeedTest.Click += new System.EventHandler(SpeedTest_Click);
		this.ValveTest.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.ValveTest.AutoSize = true;
		this.ValveTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.ValveTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.ValveTest.Enabled = false;
		this.ValveTest.FlatAppearance.BorderSize = 3;
		this.ValveTest.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.ValveTest.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.ValveTest.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.ValveTest.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.ValveTest.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.ValveTest.Location = new System.Drawing.Point(21, 216);
		this.ValveTest.Name = "ValveTest";
		this.ValveTest.Size = new System.Drawing.Size(219, 58);
		this.ValveTest.TabIndex = 3;
		this.ValveTest.Tag = "2";
		this.ValveTest.Text = "VALVE TEST";
		this.ValveTest.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.ValveTest.UseVisualStyleBackColor = true;
		this.ValveTest.Visible = false;
		this.ValveTest.Click += new System.EventHandler(MotorTest_Click);
		this.MotorTest.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.MotorTest.AutoSize = true;
		this.MotorTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.MotorTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.MotorTest.Enabled = false;
		this.MotorTest.FlatAppearance.BorderSize = 3;
		this.MotorTest.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.MotorTest.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.MotorTest.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.MotorTest.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.MotorTest.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.MotorTest.Location = new System.Drawing.Point(21, 152);
		this.MotorTest.Name = "MotorTest";
		this.MotorTest.Size = new System.Drawing.Size(219, 58);
		this.MotorTest.TabIndex = 2;
		this.MotorTest.Tag = "1";
		this.MotorTest.Text = "MOTOR TEST";
		this.MotorTest.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.MotorTest.UseVisualStyleBackColor = true;
		this.MotorTest.Visible = false;
		this.MotorTest.Click += new System.EventHandler(MotorTest_Click);
		this.WheelLockTest.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.WheelLockTest.AutoSize = true;
		this.WheelLockTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.WheelLockTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.WheelLockTest.FlatAppearance.BorderSize = 3;
		this.WheelLockTest.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.WheelLockTest.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.WheelLockTest.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.WheelLockTest.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.WheelLockTest.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.WheelLockTest.Location = new System.Drawing.Point(21, 408);
		this.WheelLockTest.Name = "WheelLockTest";
		this.WheelLockTest.Size = new System.Drawing.Size(239, 58);
		this.WheelLockTest.TabIndex = 7;
		this.WheelLockTest.Text = "WHEEL LOCK TEST";
		this.WheelLockTest.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.WheelLockTest.UseVisualStyleBackColor = true;
		this.WheelLockTest.Click += new System.EventHandler(WheelLockTest_Click);
		this.KeyPower.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.KeyPower.AutoSize = true;
		this.KeyPower.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.KeyPower.Cursor = System.Windows.Forms.Cursors.Hand;
		this.KeyPower.Enabled = false;
		this.KeyPower.FlatAppearance.BorderSize = 3;
		this.KeyPower.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.KeyPower.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.KeyPower.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.KeyPower.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.KeyPower.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.KeyPower.Location = new System.Drawing.Point(21, 88);
		this.KeyPower.Name = "KeyPower";
		this.KeyPower.Size = new System.Drawing.Size(219, 58);
		this.KeyPower.TabIndex = 1;
		this.KeyPower.Text = "KEY POWER";
		this.KeyPower.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.KeyPower.UseVisualStyleBackColor = true;
		this.KeyPower.Click += new System.EventHandler(KeyPower_Click);
		this.Values.Anchor = System.Windows.Forms.AnchorStyles.None;
		this.Values.Controls.Add(this.Comunication);
		this.Values.Controls.Add(this.Voltometer);
		this.Values.Controls.Add(this.Current);
		this.Values.Controls.Add(this.Sensor1);
		this.Values.Controls.Add(this.Sensor2);
		this.Values.Controls.Add(this.Sensor3);
		this.Values.Controls.Add(this.Sensor4);
		this.Values.Controls.Add(this.Back);
		this.Values.Location = new System.Drawing.Point(831, 0);
		this.Values.Name = "Values";
		this.Values.Size = new System.Drawing.Size(386, 684);
		this.Values.TabIndex = 4;
		this.Comunication.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Comunication.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Comunication.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Comunication.FlatAppearance.BorderSize = 3;
		this.Comunication.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Comunication.Font = new System.Drawing.Font("Calibri", 15.75f);
		this.Comunication.Location = new System.Drawing.Point(19, 315);
		this.Comunication.Name = "Comunication";
		this.Comunication.Size = new System.Drawing.Size(148, 58);
		this.Comunication.TabIndex = 15;
		this.Comunication.Tag = "0";
		this.Comunication.Text = "Comunication";
		this.Comunication.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Voltometer.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Voltometer.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Voltometer.Cursor = System.Windows.Forms.Cursors.Default;
		this.Voltometer.FlatAppearance.BorderSize = 3;
		this.Voltometer.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Voltometer.Font = new System.Drawing.Font("Yu Gothic UI", 15.75f, System.Drawing.FontStyle.Bold);
		this.Voltometer.Location = new System.Drawing.Point(19, 24);
		this.Voltometer.Name = "Voltometer";
		this.Voltometer.Size = new System.Drawing.Size(148, 58);
		this.Voltometer.TabIndex = 9;
		this.Voltometer.Text = "Voltmeter";
		this.Voltometer.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Current.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Current.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Current.Cursor = System.Windows.Forms.Cursors.Default;
		this.Current.FlatAppearance.BorderSize = 3;
		this.Current.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Current.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Current.Location = new System.Drawing.Point(203, 24);
		this.Current.Name = "Current";
		this.Current.Size = new System.Drawing.Size(171, 58);
		this.Current.TabIndex = 10;
		this.Current.Text = "Amperometer";
		this.Current.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor1.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Sensor1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor1.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Sensor1.Enabled = false;
		this.Sensor1.FlatAppearance.BorderSize = 3;
		this.Sensor1.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Sensor1.Font = new System.Drawing.Font("Calibri", 15.75f);
		this.Sensor1.Location = new System.Drawing.Point(19, 119);
		this.Sensor1.Name = "Sensor1";
		this.Sensor1.Size = new System.Drawing.Size(148, 58);
		this.Sensor1.TabIndex = 11;
		this.Sensor1.Tag = "0";
		this.Sensor1.Text = "FRONT LEFT";
		this.Sensor1.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor1.Click += new System.EventHandler(Sensor_Click);
		this.Sensor2.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Sensor2.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor2.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Sensor2.Enabled = false;
		this.Sensor2.FlatAppearance.BorderSize = 3;
		this.Sensor2.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Sensor2.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Sensor2.Location = new System.Drawing.Point(203, 119);
		this.Sensor2.Name = "Sensor2";
		this.Sensor2.Size = new System.Drawing.Size(171, 58);
		this.Sensor2.TabIndex = 12;
		this.Sensor2.Tag = "1";
		this.Sensor2.Text = "FRONT RIGHT";
		this.Sensor2.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor2.Click += new System.EventHandler(Sensor_Click);
		this.Sensor3.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Sensor3.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor3.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Sensor3.Enabled = false;
		this.Sensor3.FlatAppearance.BorderSize = 3;
		this.Sensor3.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Sensor3.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Sensor3.Location = new System.Drawing.Point(19, 216);
		this.Sensor3.Name = "Sensor3";
		this.Sensor3.Size = new System.Drawing.Size(148, 58);
		this.Sensor3.TabIndex = 13;
		this.Sensor3.Tag = "2";
		this.Sensor3.Text = "REAR LEFT";
		this.Sensor3.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor3.Click += new System.EventHandler(Sensor_Click);
		this.Sensor4.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Sensor4.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor4.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Sensor4.Enabled = false;
		this.Sensor4.FlatAppearance.BorderSize = 3;
		this.Sensor4.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Sensor4.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Sensor4.Location = new System.Drawing.Point(203, 216);
		this.Sensor4.Name = "Sensor4";
		this.Sensor4.Size = new System.Drawing.Size(171, 58);
		this.Sensor4.TabIndex = 14;
		this.Sensor4.Tag = "3";
		this.Sensor4.Text = "REAR RIGHT";
		this.Sensor4.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor4.Click += new System.EventHandler(Sensor_Click);
		this.Model.AutoSize = true;
		this.Model.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Model.Font = new System.Drawing.Font("Microsoft Tai Le", 27.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Model.Location = new System.Drawing.Point(466, 197);
		this.Model.Name = "Model";
		this.Model.Size = new System.Drawing.Size(132, 48);
		this.Model.TabIndex = 17;
		this.Model.Text = "Model";
		this.Model.Click += new System.EventHandler(Model_Click);
		this.Read.Enabled = true;
		this.Read.Interval = 1000;
		this.Read.Tick += new System.EventHandler(Read_Tick);
		this.Polling.Enabled = true;
		this.Polling.Interval = 300;
		this.Polling.Tick += new System.EventHandler(Polling_Tick);
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.label2.Location = new System.Drawing.Point(443, 119);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(195, 27);
		this.label2.TabIndex = 6;
		this.label2.Text = "TEST BENCH - ABS";
		this.SpeedTimer.Interval = 1000;
		this.SpeedTimer.Tick += new System.EventHandler(SpeedTimer_Tick);
		this.Print.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Print.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Print.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Print.FlatAppearance.BorderSize = 3;
		this.Print.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Print.Font = new System.Drawing.Font("Microsoft Tai Le", 15.75f, System.Drawing.FontStyle.Bold);
		this.Print.Location = new System.Drawing.Point(490, 614);
		this.Print.Name = "Print";
		this.Print.Size = new System.Drawing.Size(148, 58);
		this.Print.TabIndex = 17;
		this.Print.Text = "Print";
		this.Print.Click += new System.EventHandler(Print_Click);
		this.btnResponse.Location = new System.Drawing.Point(739, 608);
		this.btnResponse.Name = "btnResponse";
		this.btnResponse.Size = new System.Drawing.Size(75, 23);
		this.btnResponse.TabIndex = 21;
		this.btnResponse.Text = "Response";
		this.btnResponse.UseVisualStyleBackColor = true;
		this.btnResponse.Click += new System.EventHandler(btnResponse_Click);
		this.MotorOff.Tick += new System.EventHandler(MotorOff_Tick);
		this.ResponseCom.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.ResponseCom.BackColor = System.Drawing.Color.Lime;
		this.ResponseCom.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ResponseCom.Location = new System.Drawing.Point(693, 13);
		this.ResponseCom.Name = "ResponseCom";
		this.ResponseCom.Size = new System.Drawing.Size(55, 38);
		this.ResponseCom.TabIndex = 22;
		this.ResponseCom.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.SaveReportDialog.DefaultExt = "pdf";
		this.SaveReportDialog.Filter = "PDF File|*.pdf";
		this.Logo.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Logo.BackColor = System.Drawing.SystemColors.Control;
		this.Logo.Image = SC_F2_EVO.Properties.Resources.Logo;
		this.Logo.Location = new System.Drawing.Point(389, 13);
		this.Logo.Name = "Logo";
		this.Logo.Size = new System.Drawing.Size(298, 69);
		this.Logo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.Logo.TabIndex = 5;
		this.Logo.TabStop = false;
		this.ImgCar.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.ImgCar.BackColor = System.Drawing.SystemColors.Control;
		this.ImgCar.Location = new System.Drawing.Point(448, 329);
		this.ImgCar.Name = "ImgCar";
		this.ImgCar.Size = new System.Drawing.Size(190, 53);
		this.ImgCar.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.ImgCar.TabIndex = 1;
		this.ImgCar.TabStop = false;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1217, 684);
		base.Controls.Add(this.ResponseCom);
		base.Controls.Add(this.btnResponse);
		base.Controls.Add(this.Print);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.Logo);
		base.Controls.Add(this.Model);
		base.Controls.Add(this.Values);
		base.Controls.Add(this.Buttons);
		base.Controls.Add(this.ImgCar);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.MaximizeBox = false;
		base.Name = "ABS";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "MainMenuForm";
		base.WindowState = System.Windows.Forms.FormWindowState.Maximized;
		base.Activated += new System.EventHandler(ABS_Activated);
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(ABS_FormClosing);
		base.Load += new System.EventHandler(MainMenuForm_Load);
		this.Buttons.ResumeLayout(false);
		this.Buttons.PerformLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequeza).EndInit();
		this.Values.ResumeLayout(false);
		((System.ComponentModel.ISupportInitialize)this.Logo).EndInit();
		((System.ComponentModel.ISupportInitialize)this.ImgCar).EndInit();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
