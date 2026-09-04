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

public class Cambi : Form
{
	private delegate void Handle_RequestReceived(Socket client, string request);

	private delegate void Handle_ResponseReceived(string response, string host);

	private Queue<COMMAND> BufferTx;

	private ModelComponent Car;

	private int WheelTest;

	private int Samples = 0;

	private string[] Status = new string[8];

	private string Operator;

	private string InternalCode;

	private bool[] ErrorCom = new bool[2];

	private Queue<FRAME> BaseDataCAN;

	private Queue<FRAME> GearDataCAN;

	private Queue<string> Strings = new Queue<string>();

	private List<FRAME> Test;

	private Button LastButton;

	private Control[] BTN;

	private Control[] Wheel;

	private Control[] ValSens;

	private Control[] CANTest;

	private byte ErrorConnection = 0;

	private byte BaseString = 0;

	private bool TestEnable = false;

	private bool HTTPReponse = false;

	private bool ErroreCodiceABS = false;

	private bool WaitComunication;

	private bool IsElectronicConnected = false;

	private bool WaitResponse = false;

	private bool ErrorCanBUS = false;

	private double Coefficient = 0.16;

	private double Velocita = 0.0;

	private double Voltage;

	private string TimeNedded;

	private double TestSpeed = 0.0;

	private double MaxCurrent = 0.0;

	private Dictionary<int, string> PressuresText = new Dictionary<int, string>();

	private double[,] Pressure = new double[4, 4];

	private object[] ControlComunication;

	private DataTable TableBase;

	private Bitmap ImgLogo;

	private PrinterControl Printer;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private DataTable Stringhe;

	private JavaScriptSerializer Serializer;

	private HTTP Request;

	private Progress ProgressBar;

	private FormReport Report;

	private const int CP_NOCLOSE_BUTTON = 512;

	private IContainer components = null;

	private Button Back;

	private PictureBox ImgGEARBOX;

	private Button BatteryVoltage;

	private Panel Buttons;

	private Button TestCLUTCH;

	private Button TestGEARBOX;

	private Button KeyPower;

	private Panel Values;

	private Button Voltometer;

	private Button Current;

	private Button Sensor1;

	private Button Sensor2;

	private Button Sensor3;

	private Button Sensor4;

	private PictureBox Logo;

	private Label Model;

	private Timer Read;

	private Timer Polling;

	private Label label2;

	private Button Print;

	private Button Comunication;

	private Timer TestWheelLock;

	private Button btnResponse;

	private SaveFileDialog SaveReportDialog;

	private Button Parking;

	private Panel Positions;

	private Button btnS;

	private Button btnN;

	private Button btnR;

	private Button btnD;

	private Label StopGearLevel;

	private Button btnDown;

	private Button btnUP;

	private Button Engine;

	private Label label1;

	private TrackBar Frequenza;

	private Label ResponseCom;

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams createParams = base.CreateParams;
			createParams.ClassStyle |= 512;
			return createParams;
		}
	}

	public Cambi(string Operator)
	{
		this.Operator = Operator;
		InitializeComponent();
		Initialize();
		Printer = new PrinterControl();
		Printer.BeginPrint += Printer_BeginPrint;
		Printer.PrintPage += Printer_PrintPage;
		Printer.EndPrint += Printer_EndPrint;
		if (MainMenuForm.User)
		{
			base.FormBorderStyle = FormBorderStyle.Fixed3D;
			Frequenza.Visible = true;
			label1.Visible = true;
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
		BTN = new Control[7] { BatteryVoltage, KeyPower, Engine, TestGEARBOX, TestCLUTCH, Parking, Positions };
		ValSens = new Control[7] { Voltometer, Current, Comunication, Sensor1, Sensor2, Sensor3, Sensor4 };
		Wheel = new Control[4] { Sensor1, Sensor2, Sensor3, Sensor4 };
		CANTest = new Control[5] { TestGEARBOX, TestCLUTCH, Parking, Positions, Engine };
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		adapter = new OleDbDataAdapter(Command);
		Stringhe = new DataTable();
		Test = new List<FRAME>();
		TableBase = new DataTable();
		BaseDataCAN = new Queue<FRAME>();
		GearDataCAN = new Queue<FRAME>();
	}

	private void MainMenuForm_Load(object sender, EventArgs e)
	{
		SetFrom();
		if (MainMenuForm.TestElectronic > -1)
		{
			Request = new HTTP(8080);
			Request.EventHandlerRequest += EventHandlerRequest;
		}
		else
		{
			Request = new HTTP();
			Request.EventHandlerResponse += EventHandlerResponse;
		}
	}

	private void EventHandlerRequest(Socket client, string request)
	{
		Invoke(new Handle_RequestReceived(RequestReceived), client, request);
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
					TestGEARBOX.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					TestGEARBOX.ForeColor = SystemColors.Control;
				}
				TestGEARBOX.PerformClick();
				break;
			case "VALVETEST":
				if (dictionary["State"] == "ON")
				{
					TestCLUTCH.ForeColor = SystemColors.ControlText;
				}
				else if (dictionary["State"] == "OFF")
				{
					TestCLUTCH.ForeColor = SystemColors.Control;
				}
				TestCLUTCH.PerformClick();
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
				Request.SendPage(client, text);
			}
		}
		catch (Exception ex)
		{
			text = string.Format(File.ReadAllText("Error.txt"), ex.Message.Length + 109, ex.Message);
			Request.SendPage(client, text);
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
			TestGEARBOX.ForeColor = SystemColors.ControlText;
			TestGEARBOX.PerformClick();
			break;
		case "MOTORTEST:OFF":
			TestGEARBOX.ForeColor = SystemColors.Control;
			TestGEARBOX.PerformClick();
			break;
		case "VALVETEST:ON":
			TestCLUTCH.ForeColor = SystemColors.ControlText;
			TestCLUTCH.PerformClick();
			break;
		case "VALVETEST:OFF":
			TestCLUTCH.ForeColor = SystemColors.Control;
			TestCLUTCH.PerformClick();
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
					StartTest(startTest: false);
				}
				Sensor1.Text = "FRONT LEFT";
				Sensor2.Text = "FRONT RIGHT";
				Sensor3.Text = "REAR LEFT";
				Sensor4.Text = "REAR RIGHT";
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
		Request.Stop();
		Polling.Stop();
		Read.Stop();
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
		if (Report != null)
		{
			Report.Dispose();
			Report = null;
		}
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
		Bitmap image = new Bitmap("GearBox\\GearBox.jpg");
		ImgGEARBOX.Image = image;
		ImgGEARBOX.Top = (int)((double)SystemInformation.WorkingArea.Size.Height * 0.4);
		ImgGEARBOX.Left = (SystemInformation.WorkingArea.Size.Width - ImgGEARBOX.Width) / 2;
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
		foreach (Control control in bTN)
		{
			if (!Positions.Equals(control))
			{
				SetSize(control);
			}
		}
		Font font = new Font(Sensor1.Font.FontFamily, 42 * SystemInformation.WorkingArea.Size.Width / 1920, FontStyle.Bold);
		label2.Font = font;
		label2.Top = Logo.Top + Logo.Height + 10;
		label2.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - label2.CreateGraphics().MeasureString(label2.Text, font).Width) / 2;
		Model.BringToFront();
		Model.Font = font;
		Model.Top = ImgGEARBOX.Top - Model.Height;
		Model.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - Model.CreateGraphics().MeasureString(Model.Text, font).Width) / 2;
		Control[] valSens = ValSens;
		foreach (Control control2 in valSens)
		{
			control2.BackColor = MainMenuForm.bkg;
			control2.Font = font;
			if (control2.Name.IndexOf("Sensor") == -1)
			{
				control2.Text = "";
			}
			if (control2 is Button)
			{
				((Button)control2).FlatAppearance.BorderColor = MainMenuForm.bkg;
			}
		}
		Back.FlatAppearance.BorderColor = MainMenuForm.bkg;
		Print.FlatAppearance.BorderColor = MainMenuForm.bkg;
		Buttons.Top = 0;
		Buttons.Left = 0;
		Buttons.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.255);
		Buttons.Height = SystemInformation.WorkingArea.Size.Height;
		Values.Top = 0;
		Values.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.255);
		Values.Height = SystemInformation.WorkingArea.Size.Height;
		Values.Left = SystemInformation.WorkingArea.Size.Width - Values.Width + 10;
		double num = (SystemInformation.WorkingArea.Size.Height - 20) / (ValSens.Length + 1);
		double num2 = SystemInformation.WorkingArea.Size.Height / (ValSens.Length + 1);
		double num3 = 0.0;
		Control[] bTN2 = BTN;
		double num4;
		foreach (Control control3 in bTN2)
		{
			control3.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
			control3.Height = (int)num;
			num4 = num2 * num3++;
			control3.Top = (int)num4;
			control3.Left = 0;
		}
		foreach (Control control6 in Positions.Controls)
		{
			if (control6 is Button)
			{
				control6.Top = 50;
				control6.Width = 48;
				control6.Height = 58;
			}
		}
		num3 = 0.0;
		Control[] valSens2 = ValSens;
		foreach (Control control5 in valSens2)
		{
			control5.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.25);
			control5.Height = (int)num;
			num4 = num2 * num3++;
			control5.Top = (int)num4;
			control5.Left = 0;
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
		BatteryVoltage.BackgroundImage = new Bitmap("Buttons\\Battery Voltage.jpg");
		KeyPower.BackgroundImage = new Bitmap("Buttons\\Key Power.jpg");
		TestGEARBOX.BackgroundImage = new Bitmap("Buttons\\Valve test.jpg");
		TestCLUTCH.BackgroundImage = new Bitmap("Buttons\\Motor test.jpg");
		Voltometer.BackgroundImage = new Bitmap("Buttons\\Voltometer.jpg");
		Current.BackgroundImage = new Bitmap("Buttons\\Amperometer.jpg");
		Comunication.BackgroundImage = new Bitmap("Buttons\\Comunication.jpg");
		Sensor1.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor2.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor3.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Sensor4.BackgroundImage = new Bitmap("Buttons\\Wheell.jpg");
		Parking.BackgroundImage = new Bitmap("Buttons\\Parking.jpg");
		Engine.BackgroundImage = new Bitmap("Buttons\\Moving.jpg");
		Positions.BackgroundImage = new Bitmap("Buttons\\Positions.jpg");
		Back.BackgroundImage = new Bitmap("Buttons\\Back.jpg");
		Print.BackgroundImage = new Bitmap("Buttons\\Print.jpg");
	}

	private double SetSpeed(Control b, string text, double spd)
	{
		if (b.ForeColor == SystemColors.Control)
		{
			spd = 0.0;
		}
		b.Text = text + spd.ToString("###0 Hz");
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
				BufferTx.Enqueue(new COMMAND(com, cmd));
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
				label2.ForeColor = Color.Red;
			}
		}
		catch (UnauthorizedAccessException)
		{
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
				if (Report != null && MainMenuForm.DataUart[n].IndexOf("@") != 0 && MainMenuForm.DataUart[n].IndexOf("OK") != 0 && MainMenuForm.DataUart[n].IndexOf("Volt") != 0 && MainMenuForm.DataUart[n].IndexOf("Current") != 0 && MainMenuForm.DataUart[n].IndexOf("Comunication") != 0)
				{
					RichTextBox report = Report.Report;
					report.Text = report.Text + MainMenuForm.DataUart[n] + "\n";
					Report.Report.SelectionStart = Report.Report.TextLength;
					Report.Report.ScrollToCaret();
				}
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
					if (double.TryParse(MainMenuForm.Value[n], NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result2))
					{
						result2 *= 0.06103515625;
						Current.Text = result2.ToString("##0.0 A");
						Status[1] = Current.Text;
						if (MaxCurrent < result2)
						{
							MaxCurrent = result2;
						}
					}
					break;
				}
				case "Comunication":
					Comunication.Text = "Comunication: " + MainMenuForm.Value[n];
					Status[2] = MainMenuForm.Value[n];
					SetSize(Comunication);
					break;
				case "Frequency":
				{
					double num = 1.0;
					double num2 = 1.0;
					double num3 = 1.0;
					double num4 = 1.0;
					if (double.TryParse(MainMenuForm.Value[n].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
					{
						label1.Text = result.ToString("###0 Hz");
						Status[3] = result.ToString("###0");
						if (Car != null)
						{
							num = Car.Alfa1;
							num2 = Car.Alfa2;
							num3 = Car.Alfa3;
							num4 = Car.Alfa4;
						}
						Status[4] = SetSpeed(Sensor1, "Sensor1: ", result * num).ToString("###0.0");
						Status[5] = SetSpeed(Sensor2, "Sensor2: ", result * num2).ToString("###0.0");
						Status[6] = SetSpeed(Sensor3, "Sensor3: ", result * num3).ToString("###0.0");
						Status[7] = SetSpeed(Sensor4, "Sensor4: ", result * num4).ToString("###0.0");
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
					InviaComando(MainMenuForm.TestElectronic, "Set ReleExt ON");
					break;
				case "Information":
					ErrorConnection = 0;
					WaitResponse = true;
					IsElectronicConnected = true;
					break;
				case "End test gauge":
					MessageBox.Show(MainMenuForm.DataUart[n] + ": " + MainMenuForm.Value[n], "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
					break;
				case "Warning":
					if (!IsElectronicConnected)
					{
						IsElectronicConnected = true;
						MessageBox.Show("Warning: " + MainMenuForm.Value[n], "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					}
					IsElectronicConnected = true;
					ErrorConnection = 10;
					break;
				case "Microsecond":
					TimeNedded = MainMenuForm.Value[n];
					Text = TimeNedded + ":" + Text;
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
				case "Error":
					if (MainMenuForm.Value[n].IndexOf("Volt") > -1)
					{
						MessageBox.Show("Voltage too low!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
						BatteryVoltage.PerformClick();
					}
					else if (MainMenuForm.Value[n].IndexOf("CAN BUS!!!") > -1)
					{
						if (!ErrorCanBUS)
						{
							MessageBox.Show(MainMenuForm.DataUart[n] + ": " + MainMenuForm.Value[n], "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
						}
						ErrorCanBUS = true;
					}
					else if (!MainMenuForm.User)
					{
						BatteryVoltage.PerformClick();
						Read.Enabled = false;
						Polling.Enabled = false;
						KeyPower.Enabled = false;
						Application.DoEvents();
						MessageBox.Show("Error Code ABS!!!\r\n\r\nConnect the cable marked: [GRM" + (Car.Code - 2000).ToString().PadLeft(4, '0') + "]", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					}
					else if (BatteryVoltage.Enabled && BatteryVoltage.ForeColor == SystemColors.ControlText)
					{
						InviaComando(MainMenuForm.TestElectronic, "Set ReleExt ON");
					}
					break;
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

	private void StartTest(bool startTest)
	{
		if (!TestEnable)
		{
			TestEnable = true;
			if (startTest)
			{
				InviaComando(MainMenuForm.TestElectronic, "Start Test");
			}
			if (Car.Type == 1)
			{
				InviaComando(MainMenuForm.TestElectronic, "Active");
			}
			else
			{
				InviaComando(MainMenuForm.TestElectronic, "Passive");
			}
			InviaComando(MainMenuForm.TestElectronic, "Select OUT:" + Car.Signal);
			Control[] cANTest = CANTest;
			foreach (Control control in cANTest)
			{
				control.Enabled = true;
			}
		}
	}

	private bool StartGEAR(bool enableparking)
	{
		TableBase.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = " + BaseString + " ORDER BY [Order]";
		adapter.Fill(TableBase);
		if (TableBase.Rows.Count > 0)
		{
			TableBase.Clear();
			Sistem.Delay(1000.0);
			BaseDataCAN.Clear();
			if (enableparking)
			{
				Parking_Click(Parking, new EventArgs());
			}
		}
		if (BaseString > 0)
		{
			InviaComando(MainMenuForm.TestElectronic, "Enable Speed");
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Disable Speed");
		}
		return TableBase.Rows.Count > 0;
	}

	private void KeyPower_Click(object sender, EventArgs e)
	{
		if (KeyPower.ForeColor == SystemColors.ControlText)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, "KEYPOWER?State=ON");
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				Read.Stop();
				BatteryVoltage.Enabled = false;
				InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
				ErrorCanBUS = false;
				BaseString = 0;
				bool startTest = StartGEAR(enableparking: true);
				StartTest(startTest);
				KeyPower.ForeColor = SystemColors.Control;
				Engine.ForeColor = SystemColors.ControlText;
				Polling_Tick(null, null);
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "KEYPOWER?State=OFF");
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			TestEnable = false;
			BatteryVoltage.Enabled = true;
			Control[] wheel = Wheel;
			foreach (Control control in wheel)
			{
				control.Enabled = false;
			}
			InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
			InviaComando(MainMenuForm.TestElectronic, "Stop Test");
			Control[] cANTest = CANTest;
			foreach (Control control2 in cANTest)
			{
				control2.Enabled = false;
			}
			KeyPower.ForeColor = SystemColors.ControlText;
		}
	}

	private void Engine_Click(object sender, EventArgs e)
	{
		if (!(Engine.ForeColor == SystemColors.ControlText))
		{
			return;
		}
		if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "ENGINE?State=ON");
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			BatteryVoltage.Enabled = false;
			InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
			BaseString = 10;
			bool flag = StartGEAR(enableparking: true);
			if (!WaitComunication || flag)
			{
				StartTest(flag);
			}
			Engine.ForeColor = SystemColors.Control;
			KeyPower.ForeColor = SystemColors.ControlText;
		}
	}

	private void BatteryVoltage_Click(object sender, EventArgs e)
	{
		if (Comunication.Text.IndexOf("None") == -1 && Comunication.Text.Replace("Comunication", "").Length > 3 && MessageBox.Show("Disable the GEAR\r\n\r\nClose Anyway?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.No)
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
				BatteryVoltage.ForeColor = SystemColors.Control;
				InviaComando(MainMenuForm.TestElectronic, "Set ReleExt ON");
				KeyPower.Enabled = true;
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
				TestEnable = false;
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

	private void Polling_Tick(object sender, EventArgs e)
	{
		COMMAND cOMMAND = new COMMAND(-1, "");
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
					ReleaseElectronic(forced: true);
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
				label2.ForeColor = Color.Red;
			}
		}
		catch (UnauthorizedAccessException)
		{
		}
	}

	private void FillTable()
	{
	}

	private void FillTable(Button test)
	{
		LastButton = test;
		FRAME fRAME = new FRAME();
		JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
		Stringhe.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = " + test.Tag?.ToString() + " ORDER BY [Order]";
		adapter.Fill(Stringhe);
		GearDataCAN.Clear();
		foreach (DataRow row in Stringhe.Rows)
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
			GearDataCAN.Enqueue(fRAME);
		}
		TableBase.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = " + BaseString + " ORDER BY [Order]";
		adapter.Fill(TableBase);
		if (Stringhe.Rows.Count - TableBase.Rows.Count > 2)
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
		while (BaseDataCAN.Count > 0 && GearDataCAN.Count > 0)
		{
			fRAME = ((num % 2 != 0) ? GearDataCAN.Dequeue() : BaseDataCAN.Dequeue());
			fRAME.pos = num++;
			list.Add(fRAME);
		}
		while (BaseDataCAN.Count > 0)
		{
			fRAME = BaseDataCAN.Dequeue();
			fRAME.pos = num++;
			list.Add(fRAME);
		}
		while (GearDataCAN.Count > 0)
		{
			fRAME = GearDataCAN.Dequeue();
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

	private void Frequenza_Scroll(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Frequency:" + Frequenza.Value + "Hz");
	}

	private void TestGEARBOX_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
		InviaComando(MainMenuForm.TestElectronic, "Stop Test");
		if (!TestCLUTCH.Equals(LastButton))
		{
			FillTable(sender as Button);
		}
		else
		{
			Sistem.Delay(1500.0);
		}
		InviaComando(MainMenuForm.TestElectronic, "Set GEARBOX");
		InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
		InviaComando(MainMenuForm.TestElectronic, "Start Test");
	}

	private void TestCLUTCH_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
		InviaComando(MainMenuForm.TestElectronic, "Stop Test");
		if (!TestCLUTCH.Equals(LastButton))
		{
			FillTable(sender as Button);
		}
		else
		{
			Sistem.Delay(1500.0);
		}
		InviaComando(MainMenuForm.TestElectronic, "Set CLUTCH");
		InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
		InviaComando(MainMenuForm.TestElectronic, "Start Test");
	}

	private void Parking_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Parking");
	}

	private void btnDown_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Down");
	}

	private void btnUP_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set UP");
	}

	private void btnR_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position R");
	}

	private void btnN_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position N");
	}

	private void btnD_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position D");
	}

	private void btnS_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position S");
	}

	private void btnResponse_Click(object sender, EventArgs e)
	{
		Report = new FormReport(enableprinter: false);
		Report.FormClosed += Form_FormClosed;
		Report.TopMost = true;
		Report.Show();
	}

	private void Form_FormClosed(object sender, FormClosedEventArgs e)
	{
		Form form = sender as Form;
		form.Dispose();
		form = null;
	}

	private void StopGearLevel_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Stop");
	}

	private void Read_Tick(object sender, EventArgs e)
	{
		if (MainMenuForm.TestElectronic > -1)
		{
			InviaComando(MainMenuForm.TestElectronic, "Volt");
			InviaComando(MainMenuForm.TestElectronic, "Current");
			InviaComando(MainMenuForm.TestElectronic, "Comunication");
		}
		else
		{
			InviaComando(3, "Status");
		}
	}

	private void Model_Click(object sender, EventArgs e)
	{
		Cursor = Cursors.WaitCursor;
		SelectModelForm selectModelForm = null;
		if (BatteryVoltage.ForeColor == SystemColors.Control)
		{
			MessageBox.Show("Disconnect Battery", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			Cursor = Cursors.Default;
			return;
		}
		Read.Stop();
		if (sender != null)
		{
			selectModelForm = new SelectModelForm(1);
		}
		if ((sender == null || selectModelForm.ShowDialog() == DialogResult.OK) && MainMenuForm.N_STRING > 1)
		{
			if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
			{
				InviaComando(3, $"MODEL?ID={MainMenuForm.ID_Modello}&Model={MainMenuForm.NomeModello}");
				Read.Start();
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
				Buttons.Enabled = MainMenuForm.N_STRING > 1;
				Model.Text = "Model: " + MainMenuForm.NomeModello;
				Model.Left = (int)((float)SystemInformation.WorkingArea.Size.Width - Model.CreateGraphics().MeasureString(Model.Text, Model.Font).Width) / 2;
				Command.CommandText = "SELECT * FROM Modelli WHERE ID = " + MainMenuForm.ID_Modello;
				DataTable dataTable = new DataTable();
				adapter.Fill(dataTable);
				WaitComunication = bool.Parse(dataTable.Rows[0]["WaitComunication"].ToString());
				Car.Speed = sbyte.Parse(dataTable.Rows[0]["SpeedCAN"].ToString());
				Car.Type = Convert.ToByte(bool.Parse(dataTable.Rows[0]["Type"].ToString()));
				Car.Signal = byte.Parse(dataTable.Rows[0]["Signal"].ToString());
				Car.Spike = bool.Parse(dataTable.Rows[0]["Spike"].ToString());
				Car.Component = (byte)dataTable.Rows[0]["Component"];
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
					Car.Wheel2Res1 = 1500.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel2Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel2Res2))
				{
					Car.Wheel2Res2 = 200.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel3Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel3Res1))
				{
					Car.Wheel3Res1 = 1500.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel3Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel3Res2))
				{
					Car.Wheel3Res2 = 200.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel4Res1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel4Res1))
				{
					Car.Wheel4Res1 = 1500.0;
				}
				if (!double.TryParse(dataTable.Rows[0]["Wheel4Res2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Wheel4Res2))
				{
					Car.Wheel4Res2 = 200.0;
				}
				if (!short.TryParse(dataTable.Rows[0]["Speed1"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Speed1))
				{
					Car.Speed1 = 0;
				}
				if (!short.TryParse(dataTable.Rows[0]["Speed2"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Speed2))
				{
					Car.Speed2 = 0;
				}
				if (!short.TryParse(dataTable.Rows[0]["Speed3"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Speed3))
				{
					Car.Speed3 = 0;
				}
				if (!short.TryParse(dataTable.Rows[0]["Speed4"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Car.Speed4))
				{
					Car.Speed4 = 0;
				}
				Car.Alfa1 = (double)dataTable.Rows[0]["Alfa1"];
				Car.Alfa2 = (double)dataTable.Rows[0]["Alfa2"];
				Car.Alfa3 = (double)dataTable.Rows[0]["Alfa3"];
				Car.Alfa4 = (double)dataTable.Rows[0]["Alfa4"];
				if (double.TryParse(dataTable.Rows[0]["DeltaSpeed"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
				{
					Car.DeltaSpeed = result;
				}
				if (double.TryParse(dataTable.Rows[0]["Coefficient"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
				{
					Coefficient = result;
				}
				Car.Signal++;
				Car.Speed1 = (short)((double)Car.Speed1 / Coefficient);
				Car.Speed2 = (short)((double)Car.Speed2 / Coefficient);
				Car.Speed3 = (short)((double)Car.Speed3 / Coefficient);
				Car.Speed4 = (short)((double)Car.Speed4 / Coefficient);
				Polling.Stop();
				MessageBox.Show("Connect the cable: [GRM" + (Car.Code - 2000).ToString().PadLeft(4, '0') + "]", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
				Polling.Start();
				JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
				string text = javaScriptSerializer.Serialize(Car).Replace("Name", "Model");
				if (text.Length >= 512)
				{
					MessageBox.Show("Data too long?", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
					return;
				}
				InviaComando(MainMenuForm.TestElectronic, text);
			}
		}
		Cursor = Cursors.Default;
		Read.Start();
		Polling.Start();
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
			}
			else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
			{
				button.ForeColor = SystemColors.Control;
				InviaComando(MainMenuForm.TestElectronic, "Wheel Stop:" + button.Tag);
			}
		}
		else if (MainMenuForm.TestElectronic == -1 && !HTTPReponse)
		{
			InviaComando(3, "SENSOR?State=OFF&Wheel=" + b2);
		}
		else if (MainMenuForm.TestElectronic > -1 || HTTPReponse)
		{
			button.ForeColor = SystemColors.ControlText;
			InviaComando(MainMenuForm.TestElectronic, "Wheel Go:" + button.Tag);
		}
	}

	private void Print_Click(object sender, EventArgs e)
	{
		if (MainMenuForm.CardService != -1)
		{
			DataTable dataTable = ConnessioneAccess.FillTable("SELECT DISTINCT Serial, Department, CardService, Preventive FROM ListCarsService WHERE ID = " + MainMenuForm.CardService);
			if (dataTable.Rows[0]["Department"].ToString() == "0000000000000")
			{
				InternalCode = dataTable.Rows[0]["CardService"].ToString();
			}
			else
			{
				InternalCode = dataTable.Rows[0]["Preventive"].ToString();
			}
		}
		Printer.Print();
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
			SaveReportDialog.FileName = Model.Text + " - " + DateTime.Now.ToString("dd-MM-yyyy") + " - " + InternalCode + ".pdf";
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
		RectangleF srcRect = new RectangleF(new Point(0, 0), ImgLogo.Size);
		Rectangle rectangle = new Rectangle(new Point(10, 10), new Size(100, 37));
		graphics.DrawImage(ImgLogo, rectangle, srcRect, GraphicsUnit.Pixel);
		Font font = new Font(Sensor1.Font.FontFamily, 12f, FontStyle.Bold);
		Font font2 = new Font(FontFamily.GenericMonospace, 11f, FontStyle.Bold);
		Font font3 = new Font(Sensor1.Font.FontFamily, 17f, FontStyle.Bold);
		Font font4 = new Font(Sensor1.Font.FontFamily, 26f, FontStyle.Bold);
		Font font5 = new Font(Sensor1.Font.FontFamily, 11f, FontStyle.Bold);
		int num = 0;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.05));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		float num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString("Test Report - R1304196", font4).Width) / 2f;
		graphics.DrawString("Test Report - ", font4, Brushes.Black, new PointF(num2, num + 2));
		num += (int)((double)e.MarginBounds.Size.Height * 0.05);
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.08));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		graphics.DrawString("Test number                       -", font5, Brushes.Black, new PointF(10f, num + 6));
		graphics.DrawString("Complete part number  ", font5, Brushes.Black, new PointF(10f, num + 26));
		graphics.DrawString("ABS number                       ", font5, Brushes.Black, new PointF(10f, num + 46));
		graphics.DrawString("Test protocol                       ", font5, Brushes.Black, new PointF(10f, num + 66));
		int num3 = 8;
		graphics.DrawString("Test date                        " + DateTime.Now.ToString("dd-MM-yyyy HH:mm"), font5, Brushes.Red, new PointF(450f, num + 6));
		graphics.DrawString("Tested by                      " + Operator, font5, Brushes.Red, new PointF(450f, num + 26));
		graphics.DrawString("Temperature                20.25 °C", font5, Brushes.Black, new PointF(450f, num + 46));
		graphics.DrawString("Voltage                           " + Voltometer.Text, font5, Brushes.Red, new PointF(450f, num + 66));
		num += (int)((double)e.MarginBounds.Size.Height * 0.08) + 20;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.03));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString("ABS", font3).Width) / 2f;
		graphics.DrawString("ABS", font3, Brushes.Black, new PointF(num2, num + 2));
		num += (int)((double)e.MarginBounds.Size.Height * 0.03);
		int num4 = num;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.03));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		num2 = (450f - graphics.MeasureString("ABS entry test", font3).Width) / 2f;
		graphics.DrawString("ABS entry test", font3, Brushes.Black, new PointF(num2, num + 2));
		num2 = ((float)e.MarginBounds.Size.Width - 450f - graphics.MeasureString("ABS exit test", font3).Width) / 2f;
		graphics.DrawString("ABS exit test", font3, Brushes.Black, new PointF(num2 + 450f, num + 2));
		num += (int)((double)e.MarginBounds.Size.Height * 0.03);
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.43));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		string text = "NO";
		if (Comunication.Text.Split(':').Length > 1 && Comunication.Text.Split(':')[1].Trim() != "None")
		{
			text = "YES";
		}
		num3 = 8;
		graphics.DrawString("Test number      ", font2, Brushes.Black, new PointF(10f, num + 4));
		graphics.DrawString("OE ABS number    ", font2, Brushes.Black, new PointF(10f, num + 25));
		graphics.DrawString("Software version ", font2, Brushes.Black, new PointF(10f, num + 28 + 20));
		graphics.DrawString("Hardware version ", font2, Brushes.Black, new PointF(10f, num + 50 + 20));
		graphics.DrawString("Comunication     " + text, font2, Brushes.Red, new PointF(10f, num + 72 + 20));
		graphics.DrawString("Long coding      ", font2, Brushes.Black, new PointF(10f, num + 94 + 20));
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 450, num4, 450, num4 + (int)((double)e.MarginBounds.Size.Height * 0.46));
		graphics.DrawString("Test number   " + "-".PadRight(num3), font2, Brushes.Black, new PointF(460f, num + 4));
		graphics.DrawString("Test result   Pass", font2, Brushes.Black, new PointF(460f, num + 25));
		graphics.DrawString("Software ver. ", font2, Brushes.Black, new PointF(460f, num + 28 + 20));
		graphics.DrawString("Hardware ver. H35", font2, Brushes.Black, new PointF(460f, num + 50 + 20));
		graphics.DrawString("Comunication  " + text, font2, Brushes.Red, new PointF(460f, num + 72 + 20));
		graphics.DrawString("Cod. Compar. Pass", font2, Brushes.Black, new PointF(460f, num + 94 + 20));
		int num5 = num;
		num5 += (int)((double)e.MarginBounds.Size.Height * 0.12);
		num4 = num5;
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num5, e.MarginBounds.Size.Width, num5);
		graphics.DrawString("ABS Simulation: " + 0 + " Km/h", font, Brushes.Black, new PointF(460f, num5 + 4));
		graphics.DrawString("Front Left  " + 0.ToString("###0.0") + "   Km/h", font2, Brushes.Red, new PointF(460f, num5 + 28 + 20));
		graphics.DrawString("Front Right " + 0.ToString("###0.0") + "   Km/h", font2, Brushes.Red, new PointF(460f, num5 + 50 + 20));
		graphics.DrawString("Rear Left   " + 0.ToString("###0.0") + "   Km/h", font2, Brushes.Red, new PointF(460f, num5 + 72 + 20));
		graphics.DrawString("Rear Right  " + 0.ToString("###0.0") + "   Km/h", font2, Brushes.Red, new PointF(460f, num5 + 94 + 20));
		graphics.DrawString("ABS function bar: ", font, Brushes.Black, new PointF(10f, num5 + 4));
		graphics.DrawString("Front Left  " + Pressure[0, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(10f, num5 + 28 + 20));
		graphics.DrawString("Front Right " + Pressure[1, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(10f, num5 + 50 + 20));
		graphics.DrawString("Rear Left   " + Pressure[2, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(10f, num5 + 72 + 20));
		graphics.DrawString("Rear Right  " + Pressure[3, 0].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(10f, num5 + 94 + 20));
		graphics.DrawString(Pressure[0, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(200f, num5 + 28 + 20));
		graphics.DrawString(Pressure[1, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(200f, num5 + 50 + 20));
		graphics.DrawString(Pressure[2, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(200f, num5 + 72 + 20));
		graphics.DrawString(Pressure[3, 1].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(200f, num5 + 94 + 20));
		graphics.DrawString(Pressure[0, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(280f, num5 + 28 + 20));
		graphics.DrawString(Pressure[1, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(280f, num5 + 50 + 20));
		graphics.DrawString(Pressure[2, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(280f, num5 + 72 + 20));
		graphics.DrawString(Pressure[3, 2].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(280f, num5 + 94 + 20));
		graphics.DrawString(Pressure[0, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(360f, num5 + 28 + 20));
		graphics.DrawString(Pressure[1, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(360f, num5 + 50 + 20));
		graphics.DrawString(Pressure[2, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(360f, num5 + 72 + 20));
		graphics.DrawString(Pressure[3, 3].ToString("###0.0").PadLeft(5), font2, Brushes.Red, new PointF(360f, num5 + 94 + 20));
		num5 += (int)((double)e.MarginBounds.Size.Height * 0.13);
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num5, e.MarginBounds.Size.Width, num5);
		graphics.DrawString("Absorted current peak " + MaxCurrent.ToString("###0.0") + "A", font, Brushes.Red, new PointF(10f, num5 + 4));
		num5 += (int)((double)e.MarginBounds.Size.Height * 0.06);
		num3 = 31;
		graphics.DrawLine(new Pen(Brushes.Black, 3f), 0, num5, e.MarginBounds.Size.Width, num5);
		num += (int)((double)e.MarginBounds.Size.Height * 0.43) + 20;
		rectangle = new Rectangle(0, num, e.MarginBounds.Size.Width, (int)((double)e.MarginBounds.Size.Height * 0.03));
		graphics.DrawRectangle(new Pen(Brushes.Black, 5f), rectangle);
		num2 = ((float)e.MarginBounds.Size.Width - graphics.MeasureString("Pass", font3).Width) / 2f;
		graphics.DrawString("Pass", font3, Brushes.Black, new PointF(num2, num + 2));
	}

	private void Printer_EndPrint(object sender, PrintEventArgs e)
	{
		if (!Printer.IsPreview)
		{
			Printer.Close();
		}
	}

	private void ABS_FormClosing(object sender, FormClosingEventArgs e)
	{
		Cursor = Cursors.WaitCursor;
		Read.Stop();
		Polling.Stop();
		Sistem.Delay(700.0);
		if (MainMenuForm.TestElectronic > -1)
		{
			Request.EventHandlerRequest -= EventHandlerRequest;
		}
		else
		{
			Request.EventHandlerResponse -= EventHandlerResponse;
		}
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
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SC_F2_EVO.Cambi));
		this.Back = new System.Windows.Forms.Button();
		this.ImgGEARBOX = new System.Windows.Forms.PictureBox();
		this.BatteryVoltage = new System.Windows.Forms.Button();
		this.Buttons = new System.Windows.Forms.Panel();
		this.label1 = new System.Windows.Forms.Label();
		this.Frequenza = new System.Windows.Forms.TrackBar();
		this.Engine = new System.Windows.Forms.Button();
		this.Positions = new System.Windows.Forms.Panel();
		this.btnDown = new System.Windows.Forms.Button();
		this.btnUP = new System.Windows.Forms.Button();
		this.StopGearLevel = new System.Windows.Forms.Label();
		this.btnD = new System.Windows.Forms.Button();
		this.btnS = new System.Windows.Forms.Button();
		this.btnN = new System.Windows.Forms.Button();
		this.btnR = new System.Windows.Forms.Button();
		this.Parking = new System.Windows.Forms.Button();
		this.TestCLUTCH = new System.Windows.Forms.Button();
		this.TestGEARBOX = new System.Windows.Forms.Button();
		this.KeyPower = new System.Windows.Forms.Button();
		this.Values = new System.Windows.Forms.Panel();
		this.Comunication = new System.Windows.Forms.Button();
		this.Voltometer = new System.Windows.Forms.Button();
		this.Current = new System.Windows.Forms.Button();
		this.Sensor1 = new System.Windows.Forms.Button();
		this.Sensor2 = new System.Windows.Forms.Button();
		this.Sensor3 = new System.Windows.Forms.Button();
		this.Sensor4 = new System.Windows.Forms.Button();
		this.Logo = new System.Windows.Forms.PictureBox();
		this.Model = new System.Windows.Forms.Label();
		this.Read = new System.Windows.Forms.Timer(this.components);
		this.Polling = new System.Windows.Forms.Timer(this.components);
		this.label2 = new System.Windows.Forms.Label();
		this.Print = new System.Windows.Forms.Button();
		this.TestWheelLock = new System.Windows.Forms.Timer(this.components);
		this.btnResponse = new System.Windows.Forms.Button();
		this.SaveReportDialog = new System.Windows.Forms.SaveFileDialog();
		this.ResponseCom = new System.Windows.Forms.Label();
		((System.ComponentModel.ISupportInitialize)this.ImgGEARBOX).BeginInit();
		this.Buttons.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequenza).BeginInit();
		this.Positions.SuspendLayout();
		this.Values.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Logo).BeginInit();
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
		this.ImgGEARBOX.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.ImgGEARBOX.BackColor = System.Drawing.SystemColors.Control;
		this.ImgGEARBOX.Location = new System.Drawing.Point(448, 349);
		this.ImgGEARBOX.Name = "ImgGEARBOX";
		this.ImgGEARBOX.Size = new System.Drawing.Size(190, 53);
		this.ImgGEARBOX.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.ImgGEARBOX.TabIndex = 1;
		this.ImgGEARBOX.TabStop = false;
		this.BatteryVoltage.Anchor = System.Windows.Forms.AnchorStyles.None;
		this.BatteryVoltage.AutoSize = true;
		this.BatteryVoltage.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.BatteryVoltage.Cursor = System.Windows.Forms.Cursors.Hand;
		this.BatteryVoltage.FlatAppearance.BorderSize = 3;
		this.BatteryVoltage.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.BatteryVoltage.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.BatteryVoltage.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.BatteryVoltage.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.BatteryVoltage.Location = new System.Drawing.Point(82, 22);
		this.BatteryVoltage.Name = "BatteryVoltage";
		this.BatteryVoltage.Size = new System.Drawing.Size(248, 60);
		this.BatteryVoltage.TabIndex = 0;
		this.BatteryVoltage.Text = "BATTERY VOLTAGE";
		this.BatteryVoltage.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.BatteryVoltage.UseVisualStyleBackColor = true;
		this.BatteryVoltage.Click += new System.EventHandler(BatteryVoltage_Click);
		this.Buttons.BackColor = System.Drawing.SystemColors.Control;
		this.Buttons.Controls.Add(this.label1);
		this.Buttons.Controls.Add(this.Frequenza);
		this.Buttons.Controls.Add(this.Engine);
		this.Buttons.Controls.Add(this.Positions);
		this.Buttons.Controls.Add(this.Parking);
		this.Buttons.Controls.Add(this.TestCLUTCH);
		this.Buttons.Controls.Add(this.TestGEARBOX);
		this.Buttons.Controls.Add(this.KeyPower);
		this.Buttons.Controls.Add(this.BatteryVoltage);
		this.Buttons.Enabled = false;
		this.Buttons.Location = new System.Drawing.Point(0, 0);
		this.Buttons.Name = "Buttons";
		this.Buttons.Size = new System.Drawing.Size(383, 684);
		this.Buttons.TabIndex = 3;
		this.label1.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(156, 615);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(84, 20);
		this.label1.TabIndex = 26;
		this.label1.Text = "Frequency";
		this.label1.Visible = false;
		this.Frequenza.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Frequenza.Location = new System.Drawing.Point(19, 636);
		this.Frequenza.Maximum = 3000;
		this.Frequenza.Name = "Frequenza";
		this.Frequenza.Size = new System.Drawing.Size(344, 45);
		this.Frequenza.TabIndex = 25;
		this.Frequenza.Visible = false;
		this.Frequenza.Scroll += new System.EventHandler(Frequenza_Scroll);
		this.Engine.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Engine.AutoSize = true;
		this.Engine.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Engine.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Engine.Enabled = false;
		this.Engine.FlatAppearance.BorderSize = 3;
		this.Engine.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.Engine.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.Engine.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.Engine.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Engine.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.Engine.Location = new System.Drawing.Point(82, 344);
		this.Engine.Name = "Engine";
		this.Engine.Size = new System.Drawing.Size(317, 58);
		this.Engine.TabIndex = 24;
		this.Engine.Tag = "10";
		this.Engine.Text = "ENGINE";
		this.Engine.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.Engine.UseVisualStyleBackColor = true;
		this.Engine.Click += new System.EventHandler(Engine_Click);
		this.Positions.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Positions.Controls.Add(this.btnDown);
		this.Positions.Controls.Add(this.btnUP);
		this.Positions.Controls.Add(this.StopGearLevel);
		this.Positions.Controls.Add(this.btnD);
		this.Positions.Controls.Add(this.btnS);
		this.Positions.Controls.Add(this.btnN);
		this.Positions.Controls.Add(this.btnR);
		this.Positions.Enabled = false;
		this.Positions.Font = new System.Drawing.Font("Microsoft Sans Serif", 27.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Positions.Location = new System.Drawing.Point(21, 430);
		this.Positions.Name = "Positions";
		this.Positions.Size = new System.Drawing.Size(344, 144);
		this.Positions.TabIndex = 23;
		this.Positions.Text = "Positions";
		this.btnDown.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnDown.Location = new System.Drawing.Point(14, 50);
		this.btnDown.Name = "btnDown";
		this.btnDown.Size = new System.Drawing.Size(48, 58);
		this.btnDown.TabIndex = 6;
		this.btnDown.Tag = "4";
		this.btnDown.Text = "-";
		this.btnDown.UseVisualStyleBackColor = true;
		this.btnDown.Click += new System.EventHandler(btnDown_Click);
		this.btnUP.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnUP.Location = new System.Drawing.Point(68, 50);
		this.btnUP.Name = "btnUP";
		this.btnUP.Size = new System.Drawing.Size(48, 58);
		this.btnUP.TabIndex = 5;
		this.btnUP.Tag = "5";
		this.btnUP.Text = "+";
		this.btnUP.UseVisualStyleBackColor = true;
		this.btnUP.Click += new System.EventHandler(btnUP_Click);
		this.StopGearLevel.AutoSize = true;
		this.StopGearLevel.BackColor = System.Drawing.Color.Transparent;
		this.StopGearLevel.Cursor = System.Windows.Forms.Cursors.Hand;
		this.StopGearLevel.Font = new System.Drawing.Font("Microsoft Sans Serif", 24f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopGearLevel.Location = new System.Drawing.Point(7, 5);
		this.StopGearLevel.Name = "StopGearLevel";
		this.StopGearLevel.Size = new System.Drawing.Size(334, 37);
		this.StopGearLevel.TabIndex = 4;
		this.StopGearLevel.Text = "Gear Lever Positions";
		this.StopGearLevel.Click += new System.EventHandler(StopGearLevel_Click);
		this.btnD.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnD.Location = new System.Drawing.Point(230, 50);
		this.btnD.Name = "btnD";
		this.btnD.Size = new System.Drawing.Size(48, 58);
		this.btnD.TabIndex = 3;
		this.btnD.Tag = "8";
		this.btnD.Text = "D";
		this.btnD.UseVisualStyleBackColor = true;
		this.btnD.Click += new System.EventHandler(btnD_Click);
		this.btnS.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.btnS.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnS.Location = new System.Drawing.Point(284, 50);
		this.btnS.Name = "btnS";
		this.btnS.Size = new System.Drawing.Size(48, 58);
		this.btnS.TabIndex = 2;
		this.btnS.Tag = "9";
		this.btnS.Text = "S";
		this.btnS.UseVisualStyleBackColor = true;
		this.btnS.Click += new System.EventHandler(btnS_Click);
		this.btnN.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnN.Location = new System.Drawing.Point(176, 50);
		this.btnN.Name = "btnN";
		this.btnN.Size = new System.Drawing.Size(48, 58);
		this.btnN.TabIndex = 1;
		this.btnN.Tag = "7";
		this.btnN.Text = "N";
		this.btnN.UseVisualStyleBackColor = true;
		this.btnN.Click += new System.EventHandler(btnN_Click);
		this.btnR.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnR.Location = new System.Drawing.Point(122, 50);
		this.btnR.Name = "btnR";
		this.btnR.Size = new System.Drawing.Size(48, 58);
		this.btnR.TabIndex = 0;
		this.btnR.Tag = "6";
		this.btnR.Text = "R";
		this.btnR.UseVisualStyleBackColor = true;
		this.btnR.Click += new System.EventHandler(btnR_Click);
		this.Parking.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.Parking.AutoSize = true;
		this.Parking.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Parking.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Parking.Enabled = false;
		this.Parking.FlatAppearance.BorderSize = 3;
		this.Parking.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.Parking.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.Parking.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.Parking.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Parking.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.Parking.Location = new System.Drawing.Point(82, 280);
		this.Parking.Name = "Parking";
		this.Parking.Size = new System.Drawing.Size(317, 58);
		this.Parking.TabIndex = 23;
		this.Parking.Tag = "3";
		this.Parking.Text = "PARKING";
		this.Parking.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.Parking.UseVisualStyleBackColor = true;
		this.Parking.Click += new System.EventHandler(Parking_Click);
		this.TestCLUTCH.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.TestCLUTCH.AutoSize = true;
		this.TestCLUTCH.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.TestCLUTCH.Cursor = System.Windows.Forms.Cursors.Hand;
		this.TestCLUTCH.Enabled = false;
		this.TestCLUTCH.FlatAppearance.BorderSize = 3;
		this.TestCLUTCH.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.TestCLUTCH.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.TestCLUTCH.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.TestCLUTCH.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.TestCLUTCH.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.TestCLUTCH.Location = new System.Drawing.Point(82, 216);
		this.TestCLUTCH.Name = "TestCLUTCH";
		this.TestCLUTCH.Size = new System.Drawing.Size(317, 58);
		this.TestCLUTCH.TabIndex = 3;
		this.TestCLUTCH.Tag = "2";
		this.TestCLUTCH.Text = "CLUTCH ACTUATOR TEST";
		this.TestCLUTCH.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.TestCLUTCH.UseVisualStyleBackColor = true;
		this.TestCLUTCH.Click += new System.EventHandler(TestCLUTCH_Click);
		this.TestGEARBOX.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.TestGEARBOX.AutoSize = true;
		this.TestGEARBOX.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.TestGEARBOX.Cursor = System.Windows.Forms.Cursors.Hand;
		this.TestGEARBOX.Enabled = false;
		this.TestGEARBOX.FlatAppearance.BorderSize = 3;
		this.TestGEARBOX.FlatAppearance.CheckedBackColor = System.Drawing.SystemColors.Control;
		this.TestGEARBOX.FlatAppearance.MouseDownBackColor = System.Drawing.SystemColors.ControlDarkDark;
		this.TestGEARBOX.FlatAppearance.MouseOverBackColor = System.Drawing.SystemColors.Control;
		this.TestGEARBOX.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.TestGEARBOX.Font = new System.Drawing.Font("Microsoft Tai Le", 18f, System.Drawing.FontStyle.Bold);
		this.TestGEARBOX.Location = new System.Drawing.Point(82, 152);
		this.TestGEARBOX.Name = "TestGEARBOX";
		this.TestGEARBOX.Size = new System.Drawing.Size(371, 58);
		this.TestGEARBOX.TabIndex = 2;
		this.TestGEARBOX.Tag = "1";
		this.TestGEARBOX.Text = "GEARBOX ACTUATOR TEST";
		this.TestGEARBOX.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
		this.TestGEARBOX.UseVisualStyleBackColor = true;
		this.TestGEARBOX.Click += new System.EventHandler(TestGEARBOX_Click);
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
		this.KeyPower.Location = new System.Drawing.Point(82, 88);
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
		this.Sensor1.Text = "Sensor1";
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
		this.Sensor2.Text = "Sensor2";
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
		this.Sensor3.Text = "Sensor3";
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
		this.Sensor4.Text = "Sensor4";
		this.Sensor4.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.Sensor4.Click += new System.EventHandler(Sensor_Click);
		this.Logo.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Logo.BackColor = System.Drawing.SystemColors.Control;
		this.Logo.Image = SC_F2_EVO.Properties.Resources.Logo;
		this.Logo.Location = new System.Drawing.Point(389, 13);
		this.Logo.Name = "Logo";
		this.Logo.Size = new System.Drawing.Size(298, 69);
		this.Logo.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.Logo.TabIndex = 5;
		this.Logo.TabStop = false;
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
		this.label2.Size = new System.Drawing.Size(253, 27);
		this.label2.TabIndex = 6;
		this.label2.Text = "TEST BENCH - GEARBOX";
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
		this.TestWheelLock.Interval = 1000;
		this.btnResponse.Location = new System.Drawing.Point(728, 634);
		this.btnResponse.Name = "btnResponse";
		this.btnResponse.Size = new System.Drawing.Size(75, 23);
		this.btnResponse.TabIndex = 22;
		this.btnResponse.Text = "Response";
		this.btnResponse.UseVisualStyleBackColor = true;
		this.btnResponse.Click += new System.EventHandler(btnResponse_Click);
		this.SaveReportDialog.DefaultExt = "pdf";
		this.SaveReportDialog.Filter = "PDF File|*.pdf";
		this.ResponseCom.Anchor = System.Windows.Forms.AnchorStyles.Top;
		this.ResponseCom.BackColor = System.Drawing.Color.Lime;
		this.ResponseCom.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ResponseCom.Location = new System.Drawing.Point(693, 13);
		this.ResponseCom.Name = "ResponseCom";
		this.ResponseCom.Size = new System.Drawing.Size(55, 38);
		this.ResponseCom.TabIndex = 23;
		this.ResponseCom.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
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
		base.Controls.Add(this.ImgGEARBOX);
		base.Controls.Add(this.Buttons);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.MaximizeBox = false;
		base.Name = "Cambi";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "MainMenuForm";
		base.WindowState = System.Windows.Forms.FormWindowState.Maximized;
		base.Activated += new System.EventHandler(ABS_Activated);
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(ABS_FormClosing);
		base.Load += new System.EventHandler(MainMenuForm_Load);
		((System.ComponentModel.ISupportInitialize)this.ImgGEARBOX).EndInit();
		this.Buttons.ResumeLayout(false);
		this.Buttons.PerformLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequenza).EndInit();
		this.Positions.ResumeLayout(false);
		this.Positions.PerformLayout();
		this.Values.ResumeLayout(false);
		((System.ComponentModel.ISupportInitialize)this.Logo).EndInit();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
