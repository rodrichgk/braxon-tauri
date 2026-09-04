using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Windows.Forms;
using ElectronikSistem;
using ElectronikSistem.WebServiceUpdateFirmWare;
using SC_F2_EVO.Properties;

namespace SC_F2_EVO;

public class FormHydraulicBench : Form
{
	protected class DataButton
	{
		public PictureBox Button;

		public string Command;

		public string Value;

		public SizeF SizeText;

		public Color Color;

		public Graphics Graphics;

		public Color GetColor
		{
			get
			{
				Bitmap bitmap = (Bitmap)Button.Image;
				if (Button.Image == null)
				{
					return Color.FromArgb(0, 0, 0, 0);
				}
				int num = Button.Width / 2 - 10;
				int num2 = Button.Height - 1;
				while (num < bitmap.Width && num2 > 0 && bitmap.GetPixel(++num, --num2).ToArgb() == Color.FromArgb(0, 0, 0, 0).ToArgb())
				{
				}
				return bitmap.GetPixel(num, num2);
			}
		}
	}

	private delegate void Handle_RequestReceived(Socket client, string request);

	private delegate void Handle_Response(bool response, sbyte OpID);

	public static bool IsResistorChecked;

	private const int DELAY = 50;

	public Queue<string> Comand = new Queue<string>();

	private int IdlePressureCount = -1;

	private int WorkPressureCount = -1;

	private FormHydraulicData HydraulicData;

	private FormReport Report;

	private FormReport Terminal;

	private SelectABSForm ABSForm;

	private SelectTestForm SelectTest;

	private FormCompany WindowCompany;

	private Progress SendFile;

	private UpdateFirmWare WebService;

	private bool WaitResponse = false;

	private string SerialNumber;

	private string ReportText;

	private string ReportBuffer;

	private string ReportLast;

	private string IsReady = "Error";

	private string TestButton = null;

	private string MemFree = "8192";

	private int CodeABS = -1;

	private int ClientSelected = -1;

	private bool ErrorCom = false;

	private bool[] StatusRubinetti;

	private byte Protection = 0;

	private byte BufferProtection = 0;

	private byte SubCode = 0;

	private byte FreeMemory = 0;

	private sbyte TestFailed = 0;

	private sbyte ChannelFailed = 0;

	private sbyte ValveTesting;

	private sbyte TestProcessing = 0;

	private PictureBox[] Menometri;

	private PictureBox[] PumpControl;

	private ushort ProgressValue = 0;

	private ushort Maxinum = 1;

	private ushort StepByStep;

	private double Amper;

	private double Temperatura;

	private double PressureWork;

	private double Measure;

	private double[] Compressor;

	private double[] Channel1;

	private double[] Channel2;

	private double[] Channel3;

	private double[] Channel4;

	private new PointF[] Location;

	private PointF[] LocationP;

	private double ScaleX;

	private double ScaleY;

	private Bitmap Lancetta;

	private Bitmap Sfondo;

	private Bitmap StopImage;

	private Color Colore;

	private Font FontChannel;

	private LinearGradientBrush GradientChannel;

	private LinearGradientBrush GradientPump;

	private bool ObjectReportIsEmpty = false;

	private Queue<PictureBox> Pulsanti = new Queue<PictureBox>();

	private Queue<PictureBox> RefreshGaige = new Queue<PictureBox>();

	private Queue<string> PrintReport = new Queue<string>();

	private Queue<string> FrameStatus = new Queue<string>();

	private PictureBox[] Values;

	private List<string> ValuesTest = new List<string>();

	private uint Count;

	private uint BufferTimer = 0u;

	private uint TimerTest = 0u;

	private uint Delta = 0u;

	private string ChangeState = "";

	private string Page;

	private string Head;

	private DateTime TimerStopwatch;

	private HTTP thisServer;

	private Comunication HTTPReport;

	private Queue<object> ObjectReport = new Queue<object>();

	private Queue<string> DataReport = new Queue<string>();

	private int CarsServiceID = -1;

	private sbyte OperationID = -1;

	private Dictionary<sbyte, List<sbyte>> SelectTestABS;

	private Queue<byte> ChannelFault;

	private Dictionary<int, string> DescriptionText;

	private byte ModelABS;

	private string Barcode;

	private int Colum = 0;

	private IContainer components = null;

	private PictureBox Print;

	private PictureBox Motor;

	private PictureBox HydraulicTest;

	private PictureBox Cycle;

	private PictureBox Current;

	private PictureBox Temperature;

	private PictureBox Program;

	private Button UpLoad;

	private Button btnHydraulicLoad;

	private Button btnTerminal;

	private Button Reset;

	private Button GetABS;

	private Button Clear;

	private new PictureBox Close;

	private Label Error;

	private Label Warning;

	private PictureBox GaugePump;

	private PictureBox Gauge1;

	private PictureBox Gauge2;

	private PictureBox Gauge3;

	private PictureBox Gauge4;

	private PictureBox Bleeding;

	private Label Model;

	private Label ErrorCOMM;

	private Timer TimeOUT;

	private PictureBox txtClock;

	private PictureBox Testing;

	private PictureBox Progress;

	private Button Diagnostic;

	private PictureBox Floater;

	private Timer Clock;

	private Timer Active;

	private Timer SendReportTimer;

	private PictureBox Stop;

	private PictureBox Minus;

	private PictureBox Plus;

	private PictureBox OnOff;

	public Timer Send;

	private Label Company;

	private GroupBox GroupControl;

	private SaveFileDialog SaveReportDialog;

	private Timer LoadCicles;

	private PictureBox DownLoad;

	public PictureBox Valves;

	private Button Canali;

	private PictureBox T4;

	private PictureBox T3;

	private PictureBox T2;

	private PictureBox T1;

	public Button Disconnect;

	private Timer RefreshStatus;

	private Timer SendCommand;

	private Button Oil;

	public FormHydraulicBench()
	{
		InitializeComponent();
		StatusRubinetti = new bool[4];
		Page = "\r\nHTTP/1.1 200 OK\r\nServer: Test Bench ABS\r\nContent-Length: {0}\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n\r\n<!DOCTYPE html>\r\n<html>\r\n<head>\r\n    <meta charset='utf-8' />\r\n    <title></title>\r\n</head>\r\n<body style='vertical-align: middle; text-align: center; font-size: 100px'>\r\n    <br /><br /><br />\r\n    Configuration saved.\r\n</body>\r\n</html>\r\n\r\n";
		Head = "\r\nHTTP/1.1 200 OK\r\nServer: Test Bench ABS\r\nContent-Length: {0}\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n";
		Lancetta = (Bitmap)Image.FromFile("Lencetta3.bmp");
		Lancetta.MakeTransparent(Color.White);
		Sfondo = Resources.SfondoH;
		Compressor = new double[2];
		Channel1 = new double[2];
		Channel2 = new double[2];
		Channel3 = new double[2];
		Channel4 = new double[2];
		GaugePump.Tag = new double[2];
		Gauge1.Tag = new double[2];
		Gauge2.Tag = new double[2];
		Gauge3.Tag = new double[2];
		Gauge4.Tag = new double[2];
		Progress.Tag = 0;
		Menometri = new PictureBox[5] { Gauge1, Gauge2, GaugePump, Gauge3, Gauge4 };
		PumpControl = new PictureBox[3] { OnOff, Minus, Plus };
		Location = new PointF[5]
		{
			new PointF(1487f, 2806f),
			new PointF(4077f, 2806f),
			new PointF(6666f, 2806f),
			new PointF(9256f, 2806f),
			new PointF(11846f, 2806f)
		};
		LocationP = new PointF[3]
		{
			new PointF(2050f, 6500f),
			new PointF(7167f, 1355f),
			new PointF(7687f, 1355f)
		};
		Values = new PictureBox[13]
		{
			Testing, Stop, Bleeding, Valves, HydraulicTest, Motor, Cycle, Program, Print, Progress,
			Current, Temperature, Floater
		};
		Rectangle rect = new Rectangle(300 * GaugePump.Width / 400, 0, GaugePump.Width * 2, 22);
		GradientPump = new LinearGradientBrush(rect, Color.Red, Color.Cyan, LinearGradientMode.Horizontal);
		GradientChannel = new LinearGradientBrush(rect, Color.Red, Color.Lime, LinearGradientMode.Horizontal);
		FontChannel = new Font(FontFamily.GenericMonospace, 30f, FontStyle.Bold);
		SelectTestABS = new Dictionary<sbyte, List<sbyte>>();
		ChannelFault = new Queue<byte>();
		DescriptionText = new Dictionary<int, string>();
		UpLoad.Enabled = SystemInformation.ComputerName != "PCARTURO";
	}

	private void Report_Response(bool response, int OpID)
	{
		throw new NotImplementedException();
	}

	private void FormBench_Load(object sender, EventArgs e)
	{
		GroupControl.Visible = MainMenuForm.User;
		GroupControl.Top -= 130;
		base.Top = 0;
		base.Left = 0;
		base.Width = SystemInformation.VirtualScreen.Width;
		base.Height = SystemInformation.VirtualScreen.Height;
		WebService = new UpdateFirmWare();
		WebService.Url = MainMenuForm.URL + "UpdateFirmWare/UpdateFirmWare.asmx";
	}

	private void SetForm()
	{
		Bitmap bitmap = null;
		Graphics graphics = null;
		try
		{
			int num = 0;
			ScaleX = (double)base.Width / (double)Sfondo.Width;
			ScaleY = (double)base.Height / (double)Sfondo.Height;
			PictureBox[] menometri = Menometri;
			foreach (PictureBox pictureBox in menometri)
			{
				pictureBox.Top = (int)((double)Location[num].Y * ScaleY) - pictureBox.Height / 2;
				pictureBox.Left = (int)((double)Location[num].X * ScaleX) - pictureBox.Width / 2;
				num++;
				bitmap = new Bitmap(pictureBox.Width, pictureBox.Height);
				graphics = Graphics.FromImage(bitmap);
				graphics.DrawImage(Sfondo, new Rectangle(new Point(0, 0), pictureBox.Bounds.Size), new Rectangle((int)((double)pictureBox.Left / ScaleX), (int)((double)pictureBox.Top / ScaleY), (int)((double)pictureBox.Width / ScaleX), (int)((double)pictureBox.Height / ScaleY)), GraphicsUnit.Pixel);
				pictureBox.BackgroundImage = bitmap;
			}
			num = 0;
			PictureBox[] pumpControl = PumpControl;
			foreach (PictureBox pictureBox2 in pumpControl)
			{
				pictureBox2.Top = (int)((double)LocationP[num].Y * ScaleY) - pictureBox2.Height / 2;
				pictureBox2.Left = (int)((double)LocationP[num].X * ScaleX) - pictureBox2.Width / 2;
				num++;
				bitmap = new Bitmap(pictureBox2.Width, pictureBox2.Height);
				graphics = Graphics.FromImage(bitmap);
				graphics.DrawImage(Sfondo, new Rectangle(new Point(0, 0), pictureBox2.Bounds.Size), new Rectangle((int)((double)pictureBox2.Left / ScaleX), (int)((double)pictureBox2.Top / ScaleY), (int)((double)pictureBox2.Width / ScaleX), (int)((double)pictureBox2.Height / ScaleY)), GraphicsUnit.Pixel);
				pictureBox2.BackgroundImage = bitmap;
			}
			FormConfig formConfig = new FormConfig();
			Company.Top = (int)(70.0 * ScaleY);
			Company.Text = formConfig.UserName.Text;
			Company.Left = (SystemInformation.VirtualScreen.Width - Company.Width) / 2;
			txtClock.Top = Company.Top + Company.Height + 10;
			formConfig.Dispose();
			formConfig = null;
			Model.Top = (int)(4724.0 * ScaleY);
			Model.Left = (int)(70.0 * ScaleX);
			Testing.Top = (int)(4566.0 * ScaleY);
			Testing.Left = (SystemInformation.VirtualScreen.Width - Testing.Width) / 2;
			Error.Top = Testing.Top + Testing.Height + 20;
			Temperature.Top = (int)(4724.0 * ScaleY);
			Temperature.Left = (int)(12130.0 * ScaleX);
			Current.Top = (int)(4724.0 * ScaleY);
			Current.Left = (int)(10310.0 * ScaleX);
			Floater.Top = (int)(4280.0 * ScaleY);
			Floater.Left = (int)(2880.0 * ScaleX);
			Stop.Top = (int)(5930.0 * ScaleY);
			Stop.Left = (int)(478.0 * ScaleX);
			Stop.Height *= 2;
			Stop.Width = (int)((double)Stop.Width * 1.35);
			Bleeding.Top = (int)(5930.0 * ScaleY);
			Bleeding.Left = (int)(2530.0 * ScaleX);
			Bleeding.Height *= 2;
			Bleeding.Width = (int)((double)Bleeding.Width * 1.35);
			Valves.Top = (int)(5930.0 * ScaleY);
			Valves.Left = (int)(3730.0 * ScaleX);
			Valves.Height *= 2;
			Valves.Width = (int)((double)Valves.Width * 1.35);
			Motor.Top = (int)(5930.0 * ScaleY);
			Motor.Left = (int)(4924.0 * ScaleX);
			Motor.Height *= 2;
			Motor.Width = (int)((double)Motor.Width * 1.35);
			HydraulicTest.Top = (int)(5930.0 * ScaleY);
			HydraulicTest.Left = (int)(6120.0 * ScaleX);
			HydraulicTest.Height *= 2;
			HydraulicTest.Width = (int)((double)HydraulicTest.Width * 1.35);
			Cycle.Top = (int)(5930.0 * ScaleY);
			Cycle.Left = (int)(7316.0 * ScaleX);
			Cycle.Height *= 2;
			Cycle.Width = (int)((double)Cycle.Width * 1.35);
			Program.Top = (int)(5930.0 * ScaleY);
			Program.Left = (int)(8512.0 * ScaleX);
			Program.Height *= 2;
			Program.Width = (int)((double)Program.Width * 1.35);
			Print.Top = (int)(5930.0 * ScaleY);
			Print.Left = (int)(9710.0 * ScaleX);
			Print.Height *= 2;
			Print.Width = (int)((double)Print.Width * 1.35);
			Disconnect.Top = (int)(5975.0 * ScaleY);
			Disconnect.Left = (int)(1685.0 * ScaleX);
			Disconnect.Height *= 2;
			Close.Top = (int)(6540.0 * ScaleY);
			Close.Left = (int)(12145.7 * ScaleX);
			Close.Height *= 2;
			Close.Width = 100;
			DownLoad.Top = (int)(5950.0 * ScaleY);
			DownLoad.Left = (int)(12145.7 * ScaleX);
			DownLoad.Height *= 2;
			DownLoad.Width = 100;
			T1.Top = (int)(5950.0 * ScaleY);
			T1.Left = (int)(10921.0 * ScaleX);
			T1.Height *= 2;
			T1.Width = 70;
			T2.Top = (int)(5950.0 * ScaleY);
			T2.Left = (int)(11500.0 * ScaleX);
			T2.Height *= 2;
			T2.Width = 70;
			T3.Top = (int)(6545.0 * ScaleY);
			T3.Left = (int)(10921.0 * ScaleX);
			T3.Height *= 2;
			T3.Width = 70;
			T4.Top = (int)(6545.0 * ScaleY);
			T4.Left = (int)(11500.0 * ScaleX);
			T4.Height *= 2;
			T4.Width = 70;
			Warning.Top = SystemInformation.VirtualScreen.Height - Warning.Height - 20;
			Warning.Left = (SystemInformation.VirtualScreen.Width - Warning.Width) / 2;
			Progress.Top = (int)(5480.0 * ScaleY);
			Progress.Left = (int)(1070.0 * ScaleX);
			Progress.Width = (int)(11105.0 * ScaleX);
			PictureBox[] values = Values;
			foreach (PictureBox pictureBox3 in values)
			{
				bitmap = new Bitmap(pictureBox3.Width, pictureBox3.Height);
				graphics = Graphics.FromImage(bitmap);
				graphics.DrawImage(Sfondo, new Rectangle(new Point(0, 0), pictureBox3.Bounds.Size), new Rectangle((int)((double)pictureBox3.Left / ScaleX), (int)((double)pictureBox3.Top / ScaleY), (int)((double)pictureBox3.Width / ScaleX), (int)((double)pictureBox3.Height / ScaleY)), GraphicsUnit.Pixel);
				pictureBox3.BackgroundImage = bitmap;
				DataButton dataButton = new DataButton();
				dataButton.SizeText = graphics.MeasureString(pictureBox3.Text, pictureBox3.Font);
				dataButton.Button = pictureBox3;
				if (!double.TryParse(pictureBox3.Tag.ToString().Replace("A", "").Replace("°", ""), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
				{
					dataButton.Command = pictureBox3.Tag.ToString();
					dataButton.Color = Color.FromArgb(255, 253, 253, 253);
				}
				else
				{
					dataButton.Value = pictureBox3.Tag.ToString();
				}
				dataButton.Graphics = pictureBox3.CreateGraphics();
				pictureBox3.Tag = dataButton;
			}
			TimeOUT.Enabled = true;
			BackgroundImage = Sfondo;
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void FormHydraulicBench_Activated(object sender, EventArgs e)
	{
		if (base.Opacity == 0.0)
		{
			base.Opacity = 0.001;
			SetForm();
			Active.Enabled = true;
		}
	}

	private void Active_Tick(object sender, EventArgs e)
	{
		Active.Enabled = false;
		GaugeRefresh(GaugePump);
		GaugeRefresh(Gauge1);
		GaugeRefresh(Gauge2);
		GaugeRefresh(Gauge3);
		GaugeRefresh(Gauge4);
		RefreshFloater((DataButton)Floater.Tag);
		RefreshValue((DataButton)Current.Tag);
		RefreshValue((DataButton)Temperature.Tag);
		RefreshButton(Bleeding, new SolidBrush(((DataButton)Bleeding.Tag).Color));
		RefreshButton(Valves, new SolidBrush(((DataButton)Valves.Tag).Color));
		RefreshButton(HydraulicTest, new SolidBrush(((DataButton)HydraulicTest.Tag).Color));
		RefreshButton(Motor, new SolidBrush(((DataButton)Motor.Tag).Color));
		RefreshButton(Cycle, new SolidBrush(((DataButton)Cycle.Tag).Color));
		RefreshButton(Program, new SolidBrush(((DataButton)Program.Tag).Color));
		RefreshButton(Print, new SolidBrush(((DataButton)Print.Tag).Color));
		Clock_Tick(Clock, null);
		TimerStopwatch = DateTime.Now;
		Send.Enabled = true;
		Comand.Enqueue("ENABLESTATUS");
		Comand.Enqueue("H-GETMODEL");
		Comand.Enqueue("H-SERIALNUMBER");
		base.Opacity = 100.0;
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
			dictionary.Add("Name", "UserName");
			dictionary.Add("IPServer", "IPServer");
			dictionary.Add("URLServer", "URLServer");
			dictionary.Add("PortServer", "Port");
			request = request.Split('?')[0];
			string text3 = request;
			string text4 = text3;
			if (!(text4 == "Config/Response.html"))
			{
				if (text4 == "ENABLETEST")
				{
					string text5 = "OK";
					thisServer.SendPage(client, string.Format(Head + text5, text5.Length));
				}
				return;
			}
			int num = Page.Length - Page.IndexOf("<");
			thisServer.SendPage(client, string.Format(Page, num));
			FormConfig formConfig = new FormConfig();
			string[] array = text2.Split('&');
			foreach (string text6 in array)
			{
				string key = text6.Split('=')[0];
				string text7 = text6.Split('=')[1];
				if (dictionary.ContainsKey(key))
				{
					formConfig.Controls[dictionary[key]].Text = text7;
				}
			}
			formConfig.Save_Click(null, null);
			formConfig = null;
		}
		catch
		{
		}
	}

	private void HandleResponse(bool response, sbyte OpID)
	{
		if (base.InvokeRequired)
		{
			Invoke(new Handle_Response(Response), response, OpID);
		}
		else
		{
			Response(response, OpID);
		}
	}

	private void Response(bool response, sbyte OpID)
	{
		if (OpID > -2 && ObjectReport.Count > 0)
		{
			ObjectReport.Dequeue();
		}
		if (OpID > -1)
		{
			OperationID = OpID;
		}
		if (ObjectReport.Count > 0)
		{
			ObjectReportIsEmpty = false;
			object obj = ObjectReport.Peek();
			if (obj is AddReport)
			{
				HTTPReport.AddReportABS((AddReport)obj);
			}
			if (obj is AddOperation)
			{
				HTTPReport.AddOperation((AddOperation)obj);
			}
			if (obj is AddTestMotore)
			{
				HTTPReport.AddTestMotore((AddTestMotore)obj);
			}
			if (obj is AddTestPressione)
			{
				HTTPReport.AddTestPressione((AddTestPressione)obj);
			}
		}
		else
		{
			ObjectReportIsEmpty = true;
		}
	}

	public void Handle_DataReceived(sbyte n)
	{
		char c = '\0';
		TimerStopwatch = DateTime.Now;
		if (HydraulicData != null)
		{
			Send.Stop();
			HydraulicData.Handle_DataReceived(n);
			Send.Start();
			return;
		}
		while (MainMenuForm.BufferRx[n].Count > 0)
		{
			c = MainMenuForm.BufferRx[n].Dequeue();
			MainMenuForm.DataUart[n] += c;
			if (c != '\n')
			{
				continue;
			}
			try
			{
				TimeOUT.Stop();
				if (MainMenuForm.DataUart[n].IndexOf("\r\n") == -1)
				{
					MainMenuForm.DataUart[n] = MainMenuForm.DataUart[n].Replace("\n", "\r\n");
				}
				string text = MainMenuForm.DataUart[n];
				string text2 = text.Split(':')[0].Replace("\r\n", "");
				MainMenuForm.DataUart[n] = "";
				if (text2 != "Status" && text2 != "Report")
				{
					AddText(text);
					Send.Stop();
				}
				switch (text2)
				{
				case "OK":
					if (Comand.Count > 0)
					{
						Comand.Dequeue();
					}
					Send_Tick(null, null);
					break;
				case "Reset Enabled":
					ResetBench();
					break;
				case "Hydraulics":
					Comand.Enqueue("ACK Hydraulics");
					break;
				case "Model":
					NameABS(text);
					break;
				case "Status":
					ErrorCom = false;
					if (base.Opacity == 1.0)
					{
						FrameStatus.Enqueue(text);
						if (FrameStatus.Count == 1)
						{
							RefreshStatus.Enabled = true;
						}
						Send_Tick(null, null);
					}
					break;
				case "Step":
					break;
				case "ErrorPressureReturn":
					OnOff.Tag = "ON";
					OnOff.Invalidate();
					Comand.Clear();
					TestButton = null;
					WorkPressureCount = -1;
					break;
				case "Test failed":
				{
					string text4 = text.Split(':')[1];
					sbyte b = sbyte.Parse(text4.Split(';')[0]);
					sbyte item = sbyte.Parse(text4.Split(';')[1]);
					if (!SelectTestABS.Keys.Contains(b))
					{
						SelectTestABS.Add(b, new List<sbyte>());
					}
					if (!SelectTestABS[b].Contains(item))
					{
						SelectTestABS[b].Add(item);
					}
					break;
				}
				case "Motor failed":
					LoadCicles.Enabled = TestFailed != 0;
					TestFailed = 0;
					ChannelFailed = 0;
					break;
				case "Mem":
					MemFree = " - " + text.Split(':')[1];
					break;
				case "Report":
				{
					string text3 = text.Replace("\u0004\u0005", "\r\n").Replace("\u0004", "\r").Replace("\u0005", "\r\n")
						.Replace("Report:", "");
					for (char c3 = '1'; c3 <= '8'; c3 = (char)(c3 + 1))
					{
						text3 = text3.Replace(c3 + ") Test:", DescriptionText[c3 - 49 + 1] + ": ");
					}
					if (CarsServiceID > -1)
					{
						DataReport.Enqueue(text3);
					}
					if (ReportLast != text3)
					{
						ReportLast = text3;
						ReportBuffer += text3;
					}
					text3 = text.Split(':')[1].Replace("\r\n", "").Trim();
					if (text3 != "")
					{
						Comand.Enqueue("H-REPORTRECEIVED");
					}
					break;
				}
				case "Warning":
					Warning.Text = text.Replace("\r", "").Replace("\n", "").Replace("Warning:", "");
					if (Warning.Text.IndexOf("Oil leak in channel") > -1)
					{
						AddFault(Warning.Text);
					}
					ValuesTest.Add(text);
					break;
				case "Diagnostic":
				{
					string text3 = text.Replace("Diagnostic: ", "");
					for (char c2 = '1'; c2 <= '8'; c2 = (char)(c2 + 1))
					{
						text3 = text3.Replace(c2 + ") Test failed.", DescriptionText[c2 - 49 + 1] + " failed: ");
					}
					ValuesTest.Add(text3);
					break;
				}
				case "Serial Number":
					SerialNumber = text.Split(':')[1].Replace("\r\n", "").Trim();
					Clock_Tick(null, null);
					break;
				case "<<<Start>>>":
					Comand.Clear();
					ChannelFault.Clear();
					Disconnect.Enabled = false;
					TestFailed = 0;
					ChannelFailed = 0;
					Error.Text = "";
					SelectTestABS.Clear();
					ReportBuffer = "";
					ReportLast = "";
					IsReady = "Ready";
					Error.Text = "";
					Warning.Text = "";
					Testing.Image = null;
					Active.Enabled = true;
					break;
				case "RESET":
					Comand.Clear();
					break;
				case "DISABLESTATUS":
					WaitResponse = true;
					break;
				case "ENABLESTATUS":
					WaitResponse = true;
					break;
				}
			}
			catch (Exception)
			{
				ProgressValue = ProgressValue;
			}
			finally
			{
				Send.Start();
				TimeOUT.Start();
			}
		}
	}

	private void AddFault(string frame)
	{
		int startIndex = frame.IndexOf("channel") + "channel ".Length;
		byte item = byte.Parse(frame.Substring(startIndex, 1));
		if (!ChannelFault.Contains(item))
		{
			ChannelFault.Enqueue(item);
		}
	}

	private void RefreshStatus_Tick(object sender, EventArgs e)
	{
		bool flag = false;
		RefreshStatus.Enabled = false;
		while (FrameStatus.Count > 0)
		{
			string response = FrameStatus.Peek();
			flag = ReportDiagnostic(response);
			if (FrameStatus.Count == 1 && flag)
			{
				RefreshStatus1(response);
			}
			else
			{
				Measure += 1.0;
			}
			FrameStatus.Dequeue();
		}
	}

	private bool ReportDiagnostic(string response)
	{
		if (response.IndexOf("Status:") >= 0)
		{
			response = response.Replace("Status: ", "").Replace("\r", "").Replace("\r", "");
			string[] array = response.Replace("\r", "").Replace("\n", "").Split(";"[0]);
			if (array.Length == 39)
			{
				try
				{
					if (ChannelFault.Count > 0)
					{
						SelectChannelFault();
						return false;
					}
					double num = 1.0;
					if (double.TryParse(array[0].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
					{
						Compressor[0] = result * num;
					}
					if (double.TryParse(array[1].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
					{
						Channel1[0] = result * num;
						double.TryParse(array[31].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Channel1[1]);
					}
					if (double.TryParse(array[2].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
					{
						Channel2[0] = result * num;
						double.TryParse(array[32].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Channel2[1]);
					}
					if (double.TryParse(array[3].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
					{
						Channel3[0] = result * num;
						double.TryParse(array[33].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Channel3[1]);
					}
					if (double.TryParse(array[4].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
					{
						Channel4[0] = result * num;
						double.TryParse(array[34].Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Channel4[1]);
					}
					Amper = double.Parse(array[5].Replace(".", ","), MainMenuForm.Culture);
					string text = Amper.ToString("###0.0") + "A";
					Protection = byte.Parse(array[19]);
					Temperatura = double.Parse(array[6].Replace(".", ","), MainMenuForm.Culture);
					ValveTesting = sbyte.Parse(array[38]);
					byte b = byte.Parse(array[35]);
					for (int i = 0; i < 4; i++)
					{
						StatusRubinetti[i] = b % 2 == 1;
						b /= 2;
					}
					PressureWork = double.Parse(array[28].Replace(".", ","), MainMenuForm.Culture);
					uint num2 = uint.Parse(array[22]);
					if (num2 != BufferTimer)
					{
						if (num2 < BufferTimer)
						{
							BufferTimer = 0u;
						}
						string text2 = ((array[23] == "1") ? "ON " : "OFF");
						string text3 = ((array[24] == "1") ? "ON " : "OFF");
						string text4 = array[23] + array[24] + array[25] + Convert.ToString(byte.Parse(array[26]) >> 4, 2).PadLeft(4, '0');
						string text5 = "";
						string text6 = Convert.ToString(byte.Parse(array[26]) >> 4, 2).PadLeft(4, '0');
						text6 = text6.Substring(3, 1) + text6.Substring(2, 1) + text6.Substring(1, 1) + text6.Substring(0, 1);
						text6 += Convert.ToString(byte.Parse(array[25]), 2).PadLeft(8, '0');
						for (int j = 0; j < text6.Length; j++)
						{
							text5 = text6.Substring(j, 1) + text5;
						}
						string text7;
						if (text4 != ChangeState)
						{
							Delta = num2 - BufferTimer;
							ChangeState = text4;
							BufferTimer = num2;
							text7 = "0".PadLeft(5, '0');
							ValuesTest.Add("\r\n");
						}
						else
						{
							Delta = num2 - BufferTimer;
							text7 = Delta.ToString().PadLeft(5, '0');
						}
						sbyte b2 = sbyte.Parse(array[13]);
						if (b2 != 0)
						{
							if (b2 != TestProcessing)
							{
								if (b2 < 9)
								{
									if (b2 > 0)
									{
										ValuesTest.Add("\r\n\r\nStart: " + DescriptionText[Math.Abs(b2)] + "\r\n");
									}
									if (b2 < 0 && Math.Abs(b2) < 9)
									{
										ValuesTest.Add("End: " + DescriptionText[Math.Abs(b2)] + "\r\n\r\n");
									}
								}
								else
								{
									ValuesTest.Add("\r\nStart: Blendig\r\n\r\n");
								}
							}
							string text8 = num2.ToString().PadLeft(5, '0') + " - ";
							text8 = text8 + text7 + " - ";
							text8 = text8 + text2 + " - ";
							text8 = text8 + text3 + " - ";
							text8 = text8 + text5 + " - ";
							text8 += (StatusRubinetti[0] ? "1" : "0");
							text8 += (StatusRubinetti[1] ? "1" : "0");
							text8 += (StatusRubinetti[2] ? "1" : "0");
							text8 += (StatusRubinetti[3] ? "1 - " : "0 - ");
							text8 = text8 + Compressor[0].ToString("###0.0").PadLeft(5, ' ') + " - ";
							text8 = text8 + Channel1[0].ToString("###0.0").PadLeft(5, ' ') + " | ";
							text8 = text8 + Channel1[1].ToString("###0.0").PadLeft(5, ' ') + " - ";
							text8 = text8 + Channel2[0].ToString("###0.0").PadLeft(5, ' ') + " | ";
							text8 = text8 + Channel2[1].ToString("###0.0").PadLeft(5, ' ') + " - ";
							text8 = text8 + Channel3[0].ToString("###0.0").PadLeft(5, ' ') + " | ";
							text8 = text8 + Channel3[1].ToString("###0.0").PadLeft(5, ' ') + " - ";
							text8 = text8 + Channel4[0].ToString("###0.0").PadLeft(5, ' ') + " | ";
							text8 = text8 + Channel4[1].ToString("###0.0").PadLeft(5, ' ') + " - ";
							text8 = text8 + text.PadLeft(5, ' ') + " - ";
							text8 = text8 + Temperatura.ToString("###0.0 °C").PadLeft(8, ' ') + "\r\n";
							ValuesTest.Add(text8);
						}
						TestProcessing = b2;
					}
					return true;
				}
				catch
				{
					return false;
				}
			}
		}
		return false;
	}

	private void RefreshStatus1(string response)
	{
		try
		{
			if (response.IndexOf("Status:") >= 0)
			{
				response = response.Replace("Status: ", "").Replace("\r", "").Replace("\r", "");
				if (ErrorCOMM.Text == "Bench Disconnected")
				{
					ErrorCOMM.Text = "";
				}
				string[] array = response.Replace("\r", "").Replace("\n", "").Split(";"[0]);
				if (array.Length != 39)
				{
					return;
				}
				try
				{
					double[] array2 = (double[])GaugePump.Tag;
					if ((int)Compressor[0] != (int)array2[0])
					{
						array2[0] = Compressor[0];
						GaugeRefresh(GaugePump);
					}
					array2 = (double[])Gauge1.Tag;
					if ((int)Channel1[0] != (int)array2[0] || (int)Channel1[1] != (int)array2[1])
					{
						array2[0] = Channel1[0];
						array2[1] = Channel1[1];
						GaugeRefresh(Gauge1);
					}
					array2 = (double[])Gauge2.Tag;
					if ((int)Channel2[0] != (int)array2[0] || (int)Channel2[1] != (int)array2[1])
					{
						array2[0] = Channel2[0];
						array2[1] = Channel2[1];
						GaugeRefresh(Gauge2);
					}
					array2 = (double[])Gauge3.Tag;
					if ((int)Channel3[0] != (int)array2[0] || (int)Channel3[1] != (int)array2[1])
					{
						array2[0] = Channel3[0];
						array2[1] = Channel3[1];
						GaugeRefresh(Gauge3);
					}
					array2 = (double[])Gauge4.Tag;
					if ((int)Channel4[0] != (int)array2[0] || (int)Channel4[1] != (int)array2[1])
					{
						array2[0] = Channel4[0];
						array2[1] = Channel4[1];
						GaugeRefresh(Gauge4);
					}
					Count++;
					string text = Amper.ToString("###0.0") + "A";
					if (IsReady == "Ready" && SelectTest == null && TestFailed == 0 && SelectTestABS.Count > 0)
					{
						SelectTestFault();
					}
					if (ProgressValue != ushort.Parse(array[20]))
					{
						if (ProgressValue > ushort.Parse(array[20]))
						{
							Progress.Invalidate();
						}
						ProgressValue = ushort.Parse(array[20]);
						Maxinum = ushort.Parse(array[21]);
						int num = (int)(11105.0 * ScaleX * ((double)(int)ProgressValue / (double)(int)Maxinum));
						((DataButton)Progress.Tag).Value = num.ToString();
						RefreshValue((DataButton)Progress.Tag);
						if (ProgressValue == Maxinum && ProgressValue > 0 && Testing.Text == "MOTOR" && TestButton == "H-CYCLES")
						{
							if (((DataButton)Motor.Tag).GetColor.ToArgb() == Color.Lime.ToArgb())
							{
								WorkPressureCount = 0;
							}
							else if (StepByStep < 3)
							{
								StepByStep++;
								ProgressValue--;
							}
							else
							{
								TestButton = null;
							}
						}
					}
					if (Count % 3 == 1)
					{
						string text2 = array[27];
						if (text2 != ((DataButton)Floater.Tag).Value)
						{
							((DataButton)Floater.Tag).Value = text2;
							RefreshFloater((DataButton)Floater.Tag);
						}
					}
					else if (Count % 3 == 2)
					{
						if (text != ((DataButton)Current.Tag).Value)
						{
							((DataButton)Current.Tag).Value = text;
							RefreshValue((DataButton)Current.Tag);
						}
						if (Temperatura < -50.0 || Temperatura > 300.0)
						{
							Temperatura = 0.0;
						}
						string text3 = Temperatura.ToString("###0") + "°";
						if (text3 != ((DataButton)Temperature.Tag).Value)
						{
							((DataButton)Temperature.Tag).Value = text3;
							RefreshValue((DataButton)Temperature.Tag);
						}
					}
					bool flag = array[29] == "1";
					if (flag && Disconnect.ForeColor != Color.Red)
					{
						Disconnect.ForeColor = Color.Red;
						Disconnect.Text = "Disable POD";
					}
					if (!flag && Disconnect.ForeColor != Color.Lime)
					{
						Disconnect.ForeColor = Color.Lime;
						Disconnect.Text = "Enable POD";
						Disconnect.Enabled = true;
					}
					if (Protection != BufferProtection)
					{
						BufferProtection = Protection;
						Error.Text = "";
						if ((Protection & 1) != 0)
						{
							Error.Text += "Error: Regolator....\r\n";
						}
						else if ((Protection & 2) != 0)
						{
							Error.Text += "Error: Shield: Protection opened.\r\n";
						}
						else if ((Protection & 4) != 0)
						{
							Error.Text += "Error: Pressure loss.\r\n";
						}
						else if ((Protection & 8) != 0)
						{
							Error.Text += "Error: ABS not connected.\r\n";
						}
						else if ((Protection & 0x10) != 0)
						{
							Error.Text += "Error: Decoder ...\r\n";
						}
						else if ((Protection & 0x20) != 0)
						{
							Error.Text += "Error: Wrong ABS comparison ...\r\n";
						}
						else if ((Protection & 0x40) != 0)
						{
							Error.Text += "Error: Refill the oil! ...\r\n";
						}
						else if ((Protection & 0x80) != 0)
						{
							Error.Text += "Error: Working pressure! ...\r\n";
						}
						Error.Left = (SystemInformation.VirtualScreen.Width - Error.Width) / 2;
					}
					if (array[7] == "Ready" && IsReady != array[7])
					{
						((DataButton)Print.Tag).Color = Color.FromArgb(255, 253, 253, 253);
						RefreshButton(Print, new SolidBrush(((DataButton)Print.Tag).Color));
					}
					IsReady = array[7];
					T1.Enabled = IsReady == "Ready";
					T2.Enabled = IsReady == "Ready";
					T3.Enabled = IsReady == "Ready";
					T4.Enabled = IsReady == "Ready";
					bool flag2 = array[23] == "1";
					if (IsReady == "Ready")
					{
						OnOff.Enabled = true;
						if (flag2 && OnOff.Tag.ToString() != "OFF")
						{
							OnOff.Tag = "OFF";
							OnOff.Invalidate();
						}
						if (!flag2 && OnOff.Tag.ToString() != "ON")
						{
							OnOff.Tag = "ON";
							OnOff.Invalidate();
						}
					}
					else if (OnOff.Tag.ToString() != "--")
					{
						OnOff.Tag = "--";
						OnOff.Invalidate();
						OnOff.Enabled = false;
					}
					if (IdlePressureCount >= 0 && TestButton == null)
					{
						if (!flag2 && IdlePressureCount == 0)
						{
							OnOff.Tag = "ON";
							OnOff_Click(OnOff, null);
						}
						else if (IdlePressureCount++ > 50 && flag2)
						{
							if (IdlePressureCount == 2)
							{
								IdlePressureCount = 25;
							}
							if (Compressor[0] > 55.0)
							{
								StepMotor(Minus, new EventArgs());
							}
							else if (Compressor[0] < 45.0)
							{
								StepMotor(Plus, new EventArgs());
							}
							else if (flag2)
							{
								IdlePressureCount = -1;
								OnOff.Tag = "OFF";
								OnOff_Click(OnOff, null);
							}
						}
					}
					bool flag3 = false;
					if (WorkPressureCount >= 0 && PressureWork > 50.0 && TestButton != null)
					{
						if (!flag2 && WorkPressureCount == 0)
						{
							OnOff.Tag = "ON";
							OnOff_Click(OnOff, null);
						}
						else if (WorkPressureCount++ > 50 && flag2)
						{
							if (WorkPressureCount == 2)
							{
								WorkPressureCount = 25;
							}
							if (Compressor[0] < PressureWork - 5.0)
							{
								StepMotor(Plus, new EventArgs());
							}
							else if (Compressor[0] > PressureWork + 5.0)
							{
								StepMotor(Minus, new EventArgs());
							}
							else if (flag2 && Comand.Count == 0)
							{
								OnOff.Tag = "OFF";
								OnOff_Click(OnOff, null);
								SendCommand.Enabled = true;
								WorkPressureCount = -1;
								StepByStep++;
							}
						}
					}
					if (array[8] == "1" && array[14] == "1")
					{
						Colore = Color.Yellow;
					}
					else if (array[8] == "0" && array[14] == "0")
					{
						Colore = Color.FromArgb(255, 253, 253, 253);
					}
					else if (array[8] == "1" && array[14] == "0")
					{
						Colore = Color.Lime;
					}
					else if (array[8] == "0" && array[14] == "1")
					{
						Colore = Color.Red;
					}
					if (((DataButton)Bleeding.Tag).GetColor.ToArgb() != Colore.ToArgb())
					{
						((DataButton)Bleeding.Tag).Color = Colore;
						Pulsanti.Enqueue(Bleeding);
					}
					if (array[12] == "1" && array[18] == "1")
					{
						Colore = Color.Yellow;
					}
					else if (array[12] == "0" && array[18] == "0")
					{
						Colore = Color.FromArgb(255, 253, 253, 253);
					}
					else if (array[12] == "1" && array[18] == "0")
					{
						Colore = Color.Lime;
					}
					else if (array[12] == "0" && array[18] == "1")
					{
						Colore = Color.Red;
					}
					if (((DataButton)Valves.Tag).GetColor.ToArgb() != Colore.ToArgb())
					{
						((DataButton)Valves.Tag).Color = Colore;
						Pulsanti.Enqueue(Valves);
					}
					if (array[10] == "1" && array[16] == "1")
					{
						Colore = Color.Yellow;
					}
					else if (array[10] == "0" && array[16] == "0")
					{
						Colore = Color.FromArgb(255, 253, 253, 253);
					}
					else if (array[10] == "1" && array[16] == "0")
					{
						Colore = Color.Lime;
					}
					else if (array[10] == "0" && array[16] == "1")
					{
						Colore = Color.Red;
					}
					if (((DataButton)Motor.Tag).GetColor.ToArgb() != Colore.ToArgb())
					{
						((DataButton)Motor.Tag).Color = Colore;
						Pulsanti.Enqueue(Motor);
					}
					if (array[11] == "1" && array[17] == "1")
					{
						Colore = Color.Yellow;
					}
					else if (array[11] == "0" && array[17] == "0")
					{
						Colore = Color.FromArgb(255, 253, 253, 253);
					}
					else if (array[11] == "1" && array[17] == "0")
					{
						Colore = Color.Lime;
					}
					else if (array[11] == "0" && array[17] == "1")
					{
						Colore = Color.Red;
					}
					if (((DataButton)Cycle.Tag).GetColor.ToArgb() != Colore.ToArgb())
					{
						((DataButton)Cycle.Tag).Color = Colore;
						if (IsReady != "Error")
						{
							((DataButton)Program.Tag).Color = Color.FromArgb(255, 253, 253, 253);
						}
						else
						{
							((DataButton)Cycle.Tag).Color = Colore;
							((DataButton)Program.Tag).Color = Colore;
							((DataButton)Print.Tag).Color = Colore;
							Pulsanti.Enqueue(Print);
						}
						Pulsanti.Enqueue(Cycle);
						Pulsanti.Enqueue(Program);
					}
					if (array[9] == "1" && array[15] == "1")
					{
						Colore = Color.Yellow;
					}
					else if (array[9] == "0" && array[15] == "0")
					{
						Colore = Color.FromArgb(255, 253, 253, 253);
					}
					else if (array[9] == "1" && array[15] == "0")
					{
						Colore = Color.Lime;
					}
					else if (array[9] == "0" && array[15] == "1")
					{
						Colore = Color.Red;
					}
					if (((DataButton)HydraulicTest.Tag).GetColor.ToArgb() != Colore.ToArgb())
					{
						((DataButton)HydraulicTest.Tag).Color = Colore;
						Pulsanti.Enqueue(HydraulicTest);
					}
					TestingRefresh((DataButton)Testing.Tag);
					return;
				}
				catch
				{
					response = "";
					return;
				}
			}
			response = "";
		}
		catch
		{
			response = "";
		}
		finally
		{
		}
	}

	private void SendCommand_Tick(object sender, EventArgs e)
	{
		SendCommand.Enabled = false;
		Comand.Enqueue(TestButton);
	}

	private void SelectTestFault()
	{
		SelectTest = new SelectTestForm(SelectTestABS);
		if (SelectTest.ShowDialog() == DialogResult.OK)
		{
			TestFailed = SelectTest.TestFailed;
			ChannelFailed = SelectTest.ChannelFailed;
			LoadCicles.Enabled = true;
		}
		else
		{
			SelectTestABS.Clear();
			TestFailed = 0;
			ChannelFailed = 0;
			TestButton = null;
			WorkPressureCount = -1;
		}
		SelectTest.Dispose();
		SelectTest = null;
	}

	private void SelectChannelFault()
	{
		byte b = ChannelFault.Dequeue();
		Comand.Clear();
		ChannelFault.Clear();
		SelectTestABS.Clear();
		TestButton = null;
		WorkPressureCount = 1;
		Testing.Invalidate();
		Progress.Invalidate();
		if (MessageBox.Show("Drain unblocking: " + b, "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
		{
			Warning.Text = "";
			Sistem.Delay(200.0);
			string item = "UNLOCK:" + (byte)(b - 1);
			Comand.Enqueue(item);
		}
	}

	private void SendReport()
	{
		string text = "";
		object value = null;
		byte b = 0;
		double pompa = 0.0;
		double[] array = new double[4];
		while (DataReport.Count > 0)
		{
			text = DataReport.Dequeue();
			string[] array2 = text.Split('\n');
			foreach (string text2 in array2)
			{
				if (text2.IndexOf("MOT.ABS") > -1)
				{
					if (text2.IndexOf("OK") > -1)
					{
						value = 0;
					}
					else if (text2.IndexOf("Warning:") > -1)
					{
						value = ((text2.IndexOf("Low") > -1) ? ((object)2) : ((text2.IndexOf("Over") <= -1) ? ((object)5) : ((object)3)));
					}
					ObjectReport.Enqueue(new AddOperation(CarsServiceID, OperationID, 1));
				}
				if (text2.IndexOf("Current:") > -1)
				{
					string text3 = text2.Replace("Current:", "").Replace("A", "").Replace("\r", "")
						.Replace("\r", "");
					double current = double.Parse(text3.Replace(".", ","), MainMenuForm.Culture);
					byte result = Convert.ToByte(value);
					ObjectReport.Enqueue(new AddTestMotore(CarsServiceID, OperationID, current, result));
				}
				if (text2.IndexOf(")") == 1)
				{
					if (b > 0)
					{
						bool result2 = Convert.ToBoolean(value);
						ObjectReport.Enqueue(new AddTestPressione(CarsServiceID, OperationID, b, array[0], array[1], array[2], array[3], pompa, result2));
					}
					else
					{
						ObjectReport.Enqueue(new AddOperation(CarsServiceID, OperationID, 2));
					}
					string s = text2.Substring(0, 1);
					b = byte.Parse(s);
					value = text2.IndexOf("Ok") > -1;
				}
				if (text2.IndexOf("Channel Pressure") > -1)
				{
					int num = text2.IndexOf("=") + 1;
					int length = text2.IndexOf("Bar") - 1 - num;
					string text4 = text2.Substring(num, length);
					num = text2.IndexOf("=") - 2;
					string s2 = text2.Substring(num, 1);
					length = byte.Parse(s2) - 1;
					array[length] = double.Parse(text4.Replace(".", ","), MainMenuForm.Culture);
				}
				if (text2.IndexOf("Pump Pressure") > -1)
				{
					int num2 = text2.IndexOf("=") + 1;
					int length2 = text2.IndexOf("Bar") - 1 - num2;
					string text5 = text2.Substring(num2, length2);
					pompa = double.Parse(text5.Replace(".", ","), MainMenuForm.Culture);
				}
				if (text2.IndexOf("Pressure Ok") > -1 || text2.IndexOf("Pressure NOT Ok") > -1)
				{
					bool result3 = Convert.ToBoolean(value);
					ObjectReport.Enqueue(new AddTestPressione(CarsServiceID, OperationID, b, array[0], array[1], array[2], array[3], pompa, result3));
				}
			}
		}
		if (ObjectReportIsEmpty)
		{
			Response(response: true, -2);
		}
	}

	private void LoadCicles_Tick(object sender, EventArgs e)
	{
		LoadCicles.Enabled = false;
		if (Protection > 0)
		{
			Model.Text = "NONE";
		}
		else
		{
			btnHydraulicLoad_Click(CodeABS, new EventArgs());
		}
	}

	private void SendReportTimer_Tick(object sender, EventArgs e)
	{
		SendReportTimer.Stop();
		SendReport();
		SendReportTimer.Start();
	}

	private void Canali_Click(object sender, EventArgs e)
	{
		new FormChannels().ShowDialog();
	}

	private void Test_Click(object sender, EventArgs e)
	{
		PictureBox pictureBox = (PictureBox)sender;
		if (MessageBox.Show("Vuoi testare il programma canale: " + (byte)(byte.Parse(pictureBox.Tag.ToString()) + 1), "Question", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
		{
			Comand.Enqueue("UNLOCK:" + pictureBox.Tag.ToString());
		}
	}

	private void Disconnect_Click(object sender, EventArgs e)
	{
		if (!(Error.Text != ""))
		{
			Disconnect.Enabled = false;
			TestFailed = 0;
			ChannelFailed = 0;
			Error.Text = "";
			SelectTestABS.Clear();
			ChannelFault.Clear();
			Comand.Clear();
			Error.Text = "";
			Warning.Text = "";
			Testing.Image = null;
			if (Disconnect.ForeColor == Color.Lime)
			{
				Comand.Enqueue("H-POD:ENABLE");
				return;
			}
			ReportBuffer = "";
			ReportLast = "";
			Comand.Enqueue("H-POD:DISABLE");
		}
	}

	private void txtClock_Paint(object sender, PaintEventArgs e)
	{
		Control control = sender as Control;
		if (control.Tag != null)
		{
			e.Graphics.DrawString(control.Tag.ToString(), control.Font, Brushes.White, 0f, 0f);
		}
	}

	private void Reset_Click(object sender, EventArgs e)
	{
		TestFailed = 0;
		ChannelFailed = 0;
		SelectTestABS.Clear();
		ChannelFault.Clear();
		TestButton = null;
		WorkPressureCount = -1;
		Comand.Enqueue("H-RESET");
	}

	private void Program_Click(object sender, EventArgs e)
	{
		if (Disconnect.Enabled && !(Disconnect.ForeColor == Color.Lime))
		{
			SelectTestABS.Clear();
			SelectTestForm selectTestForm = new SelectTestForm(CodeABS, SubCode);
			if (selectTestForm.ShowDialog() == DialogResult.OK)
			{
				TestFailed = selectTestForm.TestFailed;
				ChannelFailed = selectTestForm.ChannelFailed;
				LoadCicles.Enabled = true;
			}
		}
	}

	private void GetABS_Click(object sender, EventArgs e)
	{
		Button button = sender as Button;
		Comand.Enqueue(button.Tag.ToString());
	}

	private void ResetBench()
	{
		TimeOUT.Stop();
		Send.Stop();
		Model.ForeColor = Color.Red;
		Model.Text = "Wait!!!";
		CodeABS = 0;
		ErrorCOMM.Text = "Bench Disconnected";
		if (MainMenuForm.TestHydraulic > -1)
		{
			MainMenuForm.COM[MainMenuForm.TestHydraulic].DtrEnable = true;
			MainMenuForm.COM[MainMenuForm.TestHydraulic].RtsEnable = true;
			Sistem.Delay(200.0);
			MainMenuForm.COM[MainMenuForm.TestHydraulic].DtrEnable = false;
			MainMenuForm.COM[MainMenuForm.TestHydraulic].RtsEnable = false;
		}
		TimeOUT.Start();
		Send.Start();
	}

	private void StepMotor(object sender, EventArgs e)
	{
		string text = "Step:800;";
		if (Comand.Count <= 0)
		{
			sbyte b = 1;
			if (Plus.Equals(sender))
			{
				b = -1;
			}
			text += b;
			Comand.Enqueue(text);
		}
	}

	private void btnTerminal_Click(object sender, EventArgs e)
	{
		Terminal = new FormReport(enableprinter: false);
		Terminal.FormClosed += Form_FormClosed;
		Terminal.TopMost = true;
		Terminal.Show();
	}

	private void OnOff_Paint(object sender, PaintEventArgs e)
	{
		PictureBox pictureBox = sender as PictureBox;
		Brush brush = Brushes.White;
		Font font = pictureBox.Font;
		string text = pictureBox.Tag.ToString();
		if (text == "OFF")
		{
			brush = Brushes.Red;
			font = new Font("Stencil", 22f, FontStyle.Bold, GraphicsUnit.Point, 0);
		}
		if (text == "ON")
		{
			brush = Brushes.Blue;
			font = new Font("Stencil", 26f, FontStyle.Bold, GraphicsUnit.Point, 0);
		}
		Graphics graphics = e.Graphics;
		SizeF sizeF = graphics.MeasureString(text, font);
		int num = (int)(((float)pictureBox.Width - sizeF.Width) / 2f);
		int num2 = (int)(((float)pictureBox.Height - sizeF.Height) / 2f);
		graphics.DrawString(text, font, brush, new RectangleF(num + 1, num2 + 4, sizeF.Width, sizeF.Height));
	}

	private void Oil_Click(object sender, EventArgs e)
	{
		Comand.Enqueue("H-OIL");
	}

	private void OnOff_Click(object sender, EventArgs e)
	{
		string text = "Pompa:";
		if (Disconnect.Enabled && !(Disconnect.ForeColor == Color.Lime))
		{
			if (e != null)
			{
				IdlePressureCount = -1;
				WorkPressureCount = -1;
			}
			text += OnOff.Tag.ToString();
			Comand.Enqueue(text);
		}
	}

	private void Send_Click(object sender, EventArgs e)
	{
		Control control = (Control)sender;
		Measure = 0.0;
		if (!Disconnect.Enabled || Disconnect.ForeColor == Color.Lime)
		{
			return;
		}
		if (Print.Equals(control))
		{
			if (ReportText == ReportBuffer)
			{
				Comand.Enqueue(((DataButton)control.Tag).Command);
				DateTime now = DateTime.Now;
				while (ReportText == ReportBuffer && DateTime.Now.Subtract(now).TotalMilliseconds < 1500.0)
				{
					Application.DoEvents();
				}
			}
			if (ReportText != ReportBuffer)
			{
				ReportText = ReportBuffer;
			}
			ReportOpen();
		}
		else
		{
			if (IsReady == "Busy")
			{
				return;
			}
			if (IsReady == "Wait")
			{
				if (Cycle.Equals(control))
				{
					Comand.Enqueue(((DataButton)control.Tag).Command);
					WorkPressureCount = 0;
					TestButton = ((DataButton)control.Tag).Command;
				}
			}
			else
			{
				if (Print.Equals(control))
				{
					return;
				}
				if (CarsServiceID > -1)
				{
					HTTPReport.Alive();
					if (OperationID == -1)
					{
						ObjectReport.Enqueue(new AddReport(CarsServiceID, ModelABS, Barcode));
					}
					if (Motor.Equals(control) || HydraulicTest.Equals(control))
					{
						OperationID++;
					}
				}
				Warning.Text = "";
				ValuesTest.Clear();
				RefreshGaige.Clear();
				SelectTestABS.Clear();
				ChannelFault.Clear();
				if (TestFailed == 0)
				{
				}
				if (Cycle.Equals(sender))
				{
					TestFailed = 0;
					ChannelFailed = 0;
				}
				if (HydraulicTest.Equals(control) || Bleeding.Equals(control))
				{
					IdlePressureCount = -1;
					WorkPressureCount = 0;
					TestButton = ((DataButton)control.Tag).Command;
				}
				else
				{
					if (Cycle.Equals(sender))
					{
						TestButton = ((DataButton)control.Tag).Command;
					}
					else
					{
						TestButton = null;
					}
					Comand.Enqueue(((DataButton)control.Tag).Command);
				}
				StepByStep = 0;
				Testing.Invalidate();
				Progress.Invalidate();
			}
		}
	}

	private void Clock_Tick(object sender, EventArgs e)
	{
		string text = " " + SerialNumber;
		if (!MainMenuForm.User)
		{
			text = "";
		}
		txtClock.Tag = DateTime.Now.ToString("dd/MM/yyy HH:mm") + text;
		SizeF sizeF = CreateGraphics().MeasureString(txtClock.Tag.ToString(), txtClock.Font);
		txtClock.Size = new Size((int)sizeF.Width, (int)sizeF.Height);
		txtClock.Left = (SystemInformation.VirtualScreen.Width - txtClock.Width) / 2;
		txtClock.Invalidate();
	}

	private void Diagnostic_Click(object sender, EventArgs e)
	{
		btnTerminal_Click(sender, e);
		Terminal.Report.Font = new Font(FontFamily.GenericMonospace, 8.75f, FontStyle.Bold);
		foreach (string item in ValuesTest)
		{
			Terminal.Report.Text += item;
		}
	}

	private void Send_Tick(object sender, EventArgs e)
	{
		try
		{
			double totalSeconds = DateTime.Now.Subtract(TimerStopwatch).TotalSeconds;
			if (FreeMemory++ % 4 == 0)
			{
				GC.Collect();
				GC.WaitForPendingFinalizers();
			}
			if (HydraulicData != null)
			{
				TimerStopwatch = DateTime.Now;
			}
			if (totalSeconds > 20.0)
			{
				if (MainMenuForm.TestHydraulic != -1)
				{
					Send.Stop();
					((MainMenuForm)base.Owner).ResetCom(MainMenuForm.TestHydraulic);
					Send.Start();
				}
				TimerStopwatch = DateTime.Now;
			}
			if (Comand.Count <= 0)
			{
				return;
			}
			string text = Comand.Peek();
			if (MainMenuForm.TestHydraulic != -1)
			{
				if (!MainMenuForm.COM[MainMenuForm.TestHydraulic].IsOpen)
				{
					MainMenuForm.COM[MainMenuForm.TestHydraulic].Open();
				}
				if (MainMenuForm.COM[MainMenuForm.TestHydraulic].BytesToRead >= MainMenuForm.COM[MainMenuForm.TestHydraulic].ReadBufferSize - 200)
				{
					MainMenuForm.COM[MainMenuForm.TestHydraulic].DiscardInBuffer();
				}
				MainMenuForm.COM[MainMenuForm.TestHydraulic].WriteLine(text);
			}
		}
		catch (IOException ex)
		{
			if (MainMenuForm.TestHydraulic > -1)
			{
				string contents = DateTime.Now.ToString("dd/MM/yyyy HH:mm") + " - Error: " + ex.Message;
				File.AppendAllText("Log.txt", contents);
				ErrorCom = true;
			}
		}
		catch (InvalidOperationException ex2)
		{
			string contents2 = DateTime.Now.ToString("dd/MM/yyyy HH:mm") + " - Error: " + ex2.Message;
			File.AppendAllText("Log.txt", contents2);
			if (MainMenuForm.TestHydraulic > -1)
			{
				ErrorCom = true;
			}
		}
		catch (UnauthorizedAccessException ex3)
		{
			string contents3 = DateTime.Now.ToString("dd/MM/yyyy HH:mm") + " - Error: " + ex3.Message;
			File.AppendAllText("Log.txt", contents3);
			if (MainMenuForm.TestHydraulic > -1)
			{
				ErrorCom = true;
			}
		}
	}

	private void FormHydraulicBench_FormClosing(object sender, FormClosingEventArgs e)
	{
		TimeOUT.Stop();
		Send.Stop();
	}

	public void ChangeStateReport(SerialPort com, bool enable, double timeout = 3000.0)
	{
		DateTime now = DateTime.Now;
		WaitResponse = false;
		do
		{
			if (MainMenuForm.TestHydraulic != -1)
			{
				if (enable)
				{
					if (!Comand.Contains("ENABLESTATUS"))
					{
						Comand.Enqueue("ENABLESTATUS");
					}
				}
				else if (!Comand.Contains("DISABLESTATUS"))
				{
					Comand.Enqueue("DISABLESTATUS");
				}
			}
			Sistem.Delay(300.0);
		}
		while (!WaitResponse && DateTime.Now.Subtract(now).TotalMilliseconds < timeout);
	}

	private void UpLoad_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Vuoi sostituire il database che e' in rete?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No && MessageBox.Show("Sicuro di procedere?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No)
		{
			SendFile = new Progress();
			SendFile.Status.Maximum = (int)new FileInfo("HydraulicData.accdb").Length;
			FTP.Upload("HydraulicData.accdb", MainMenuForm.Domain + "App_Data/SC%20F2-EVO/HydraulicData.accdb", MainMenuForm.Login, MainMenuForm.Password, UploadProgress, UploadCompleted);
			SendFile.Show();
		}
	}

	private void UploadProgress(object sender, UploadProgressChangedEventArgs e)
	{
		SendFile.Status.Value = (int)e.BytesSent;
		Application.DoEvents();
	}

	private void UploadCompleted(object sender, UploadFileCompletedEventArgs e)
	{
		SendFile.Close();
		SendFile = null;
		MessageBox.Show("Publicazione completata.", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
	}

	private void DownLoad_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Do you want to replace the local database?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No || MessageBox.Show("Are you sure you want to proceed?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No)
		{
			return;
		}
		try
		{
			FormConfig formConfig = new FormConfig();
			if (MainMenuForm.User || WebService.UpdateSCF2EvoBench(formConfig.UserName.Text, SerialNumber, "Hydraulics", formConfig.License.Text))
			{
				if (File.Exists("H-BackUp.accdb"))
				{
					File.Delete("H-BackUp.accdb");
				}
				if (File.Exists("HydraulicData.accdb"))
				{
					File.Move("HydraulicData.accdb", "H-BackUp.accdb");
				}
				SendFile = new Progress();
				SendFile.Status.Maximum = (int)FTP.GetSize(MainMenuForm.Domain + "App_Data/SC%20F2-EVO/HydraulicData.accdb", MainMenuForm.Login, MainMenuForm.Password);
				FTP.Download("HydraulicData.accdb", MainMenuForm.Domain + "App_Data/SC%20F2-EVO/HydraulicData.accdb", MainMenuForm.Login, MainMenuForm.Password, DownloadProgress, DownloadCompleted);
				SendFile.Show();
			}
			else
			{
				MessageBox.Show("License expired!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
			formConfig.Close();
			formConfig.Dispose();
			formConfig = null;
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message + "\r\n\r\nAn error has occurred, the database will be restored", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			if (File.Exists("HydraulicData.accdb"))
			{
				File.Delete("HydraulicData.accdb");
			}
			if (File.Exists("H-BackUp.accdb"))
			{
				File.Copy("H-BackUp.accdb", "HydraulicData.accdb");
			}
			SendFile = null;
		}
	}

	private void DownloadProgress(object sender, DownloadProgressChangedEventArgs e)
	{
		SendFile.Status.Value = (int)e.BytesReceived;
		Application.DoEvents();
	}

	private void DownloadCompleted(object sender, AsyncCompletedEventArgs e)
	{
		SendFile.Close();
		SendFile = null;
		Prmission.FileSetRule("HydraulicData.accdb");
		MessageBox.Show("Update completed.", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
	}

	private void btnHydraulicLoad_Click(object sender, EventArgs e)
	{
		TimeOUT.Stop();
		if (MainMenuForm.TestHydraulic > -1)
		{
			ChangeStateReport(MainMenuForm.COM[MainMenuForm.TestHydraulic], enable: false, 6000.0);
			if (!WaitResponse)
			{
				return;
			}
		}
		if (sender is Button)
		{
			Sistem.Delay(200.0);
			Send.Interval = 50;
			Dictionary<int, string> descriptionText = new Dictionary<int, string>();
			HydraulicData = new FormHydraulicData(this, descriptionText, IsNew: false, -1, 0, -1, -1);
			if (HydraulicData.ShowDialog() == DialogResult.OK)
			{
				Warning.Text = "";
				DescriptionText = descriptionText;
				CodeABS = HydraulicData.CodeABS;
			}
			Send.Interval = 200;
			TimerStopwatch = DateTime.Now;
			HydraulicData.Dispose();
			HydraulicData = null;
			if (MainMenuForm.TestHydraulic > -1)
			{
				ChangeStateReport(MainMenuForm.COM[MainMenuForm.TestHydraulic], enable: true);
			}
			TimeOUT.Start();
			RefreshButton(Valves, new SolidBrush(((DataButton)Valves.Tag).Color));
			Disconnect.Enabled = true;
		}
		else
		{
			string text = null;
			GroupControl.Enabled = false;
			Send.Interval = 70;
			DescriptionText.Clear();
			HydraulicData = new FormHydraulicData(this, DescriptionText, IsNew: false, CodeABS, SubCode, TestFailed, ChannelFailed);
			if (!HydraulicData.IsCycleExist)
			{
				text = "Cicle not found!!!";
			}
			else if (!HydraulicData.IsABSExist)
			{
				text = "ABS not found!!!";
			}
			if (text != null)
			{
				MessageBox.Show(text, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				EndLoad(err: true, text);
			}
		}
	}

	private void EndLoad(bool err = false, string response = null)
	{
		HydraulicData = null;
		Send.Interval = 200;
		Send.Stop();
		Send.Start();
		Disconnect.Enabled = true;
		RefreshButton(Valves, new SolidBrush(((DataButton)Valves.Tag).Color));
		GroupControl.Enabled = true;
		if (err)
		{
			TestFailed = 0;
			ChannelFailed = 0;
			SelectTestABS.Clear();
			if (response == "ABS not found!!!")
			{
				Comand.Enqueue("H-POD:DISABLE");
			}
			Comand.Enqueue("ENABLESTATUS");
		}
	}

	public void btnHydraulicLoad_Loated(object sender)
	{
		string text = sender.ToString();
		if (text != "OK")
		{
			MessageBox.Show(text, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
		else
		{
			Model.Text = "Wait";
			Model.ForeColor = Color.Yellow;
		}
		EndLoad(text != "OK");
	}

	private void ReportOpen()
	{
		Report = new FormReport(enableprinter: true);
		Report.Printer = new PrinterControl();
		Report.Printer.BeginPrint += Printer_BeginPrint;
		Report.Printer.PrintPage += Printer_PrintPage;
		Report.Printer.EndPrint += Printer_EndPrint;
		Report.Print.Click += Print_Click;
		Report.FormClosed += Form_FormClosed;
		Report.TopMost = true;
		Report.Show();
		Report.Report.Select(0, 0);
		byte b = 0;
		if (ReportText == null)
		{
			return;
		}
		string[] array = ReportText.Split('\n');
		foreach (string text in array)
		{
			int num = -1;
			if (text.IndexOf("Valve") == 0 && text.IndexOf("closure") == -1)
			{
				if (!IsResistorChecked)
				{
					continue;
				}
				if (text.IndexOf("Fault") > -1 && text.IndexOf(';') > -1)
				{
					num = text.IndexOf(';') + 1;
					b = byte.Parse(text.Substring(num).Trim());
					if (b <= 10)
					{
						Report.Report.SelectionColor = Color.Red;
					}
					else if (b > 10 && b <= 15)
					{
						Report.Report.SelectionColor = Color.DarkOrange;
					}
				}
				else
				{
					Report.Report.SelectionColor = Color.Green;
				}
			}
			else
			{
				Report.Report.SelectionColor = Color.Black;
			}
			string text2 = text;
			if (num > -1 && !MainMenuForm.User && (b <= 10 || b > 15))
			{
				text2 = text.Substring(0, num - 1).Trim();
			}
			RichTextBox report = Report.Report;
			report.SelectedText = report.SelectedText + text2 + "\n";
		}
	}

	private void Print_Click(object sende, EventArgs e)
	{
		WindowCompany = null;
	}

	private void RefreshFloater(DataButton floater)
	{
		Brush brush = null;
		double num = double.Parse(floater.Value.ToString().Replace(".", ","), MainMenuForm.Culture);
		brush = ((num > 1.5) ? new SolidBrush(Color.Lime) : ((!(num > 0.5)) ? new SolidBrush(Color.Red) : new SolidBrush(Color.Yellow)));
		floater.Graphics.DrawString("OIL", floater.Button.Font, brush, 0f, 0f);
	}

	private void RefreshValue(DataButton button)
	{
		if (Progress.Equals(button.Button))
		{
			button.Graphics.FillRectangle(new SolidBrush(Progress.BackColor), 0, 0, int.Parse(((DataButton)Progress.Tag).Value), Progress.Height);
			return;
		}
		Bitmap image = new Bitmap(button.Button.Bounds.Width, button.Button.Bounds.Height);
		Graphics graphics = Graphics.FromImage(image);
		graphics.DrawString(button.Value, button.Button.Font, Brushes.White, 0f, 0f);
		button.Button.Image = image;
	}

	private void RefreshButton(PictureBox p, Brush brush)
	{
		DataButton dataButton = (DataButton)p.Tag;
		Bitmap image = new Bitmap(p.Width, p.Height);
		Graphics graphics = Graphics.FromImage(image);
		SizeF sizeText = dataButton.SizeText;
		int num = (int)(((float)p.Width - sizeText.Width) / 2f) - 3;
		if (Valves.Equals(p) && !IsResistorChecked && Disconnect.Enabled && Disconnect.ForeColor == Color.Red)
		{
			brush = new SolidBrush(Color.Yellow);
		}
		graphics.DrawString(p.Text, p.Font, brush, new RectangleF(num, (float)p.Height - sizeText.Height + 2f, sizeText.Width, sizeText.Height));
		p.Image = image;
	}

	private void TestingRefresh(DataButton testing)
	{
		Brush brush = null;
		PictureBox pictureBox = null;
		Brush brush2 = null;
		string text = "";
		while (Pulsanti.Count > 0)
		{
			pictureBox = Pulsanti.Dequeue();
			DataButton dataButton = pictureBox.Tag as DataButton;
			brush = new SolidBrush(dataButton.Color);
			if (((SolidBrush)brush).Color.ToArgb() != Color.FromArgb(255, 253, 253, 253).ToArgb() && IsReady != "Error")
			{
				text = pictureBox.Text.Replace("\r\n", " ").ToUpper();
				brush2 = brush;
			}
			RefreshButton(pictureBox, brush);
		}
		if (brush2 != null)
		{
			Bitmap image = new Bitmap(testing.Button.Width, testing.Button.Height);
			Graphics graphics = Graphics.FromImage(image);
			if (ValveTesting > -1)
			{
				text = "TEST VALVE N° " + ValveTesting;
			}
			if (Math.Abs(TestProcessing) > 0 && text == "HYDRAULIC TEST")
			{
				text = DescriptionText[Math.Abs(TestProcessing)];
			}
			if (ChannelFault.Count > 0)
			{
				text = "";
			}
			SizeF sizeF = graphics.MeasureString(text, testing.Button.Font);
			int num = (int)(((float)testing.Button.Width - sizeF.Width) / 2f);
			graphics.DrawString(text, testing.Button.Font, brush2, num, 0f);
			testing.Button.Image = image;
			testing.Button.Text = text;
		}
	}

	private void Form_FormClosed(object sender, FormClosedEventArgs e)
	{
		Form form = sender as Form;
		form.Dispose();
		form = null;
	}

	private void AddText(string text)
	{
		if (Terminal != null)
		{
			Terminal.Report.Text += text;
		}
	}

	private void FormHydraulicBench_FormClosed(object sender, FormClosedEventArgs e)
	{
		if (Report != null)
		{
			Report.Dispose();
			Report = null;
		}
	}

	private void TimeOUT_Tick(object sender, EventArgs e)
	{
	}

	private void NameABS(string FrameRx)
	{
		string text = FrameRx.Replace("Model:", "").Trim();
		Model.Text = text.Split(';')[0];
		if (Model.Text == "NONE")
		{
			CodeABS = 0;
			Model.ForeColor = Color.Red;
			Disconnect.Enabled = true;
		}
		else if (Model.Text == "Load program")
		{
			SubCode = 0;
			CodeABS = int.Parse(text.Split(';')[1]);
			Model.ForeColor = Color.Orange;
			ABSForm = new SelectABSForm(CodeABS);
			if (ABSForm.IsGruppo)
			{
				ABSForm.ShowDialog();
			}
			SubCode = ABSForm.SubCode;
			ABSForm.Dispose();
			ABSForm = null;
			LoadCicles.Enabled = HydraulicData == null && Error.Text == "";
			if (Error.Text != "")
			{
				Model.Text = "";
			}
		}
		else
		{
			Model.ForeColor = Color.Lime;
			Disconnect.Enabled = true;
			if (MainMenuForm.TestHydraulic > -1)
			{
				Comand.Enqueue("ENABLESTATUS");
			}
			if (TestFailed > 0)
			{
				Send_Click(Cycle, new EventArgs());
			}
		}
	}

	private void Clear_Click(object sender, EventArgs e)
	{
		if (Terminal != null)
		{
			Terminal.Report.Text = "";
		}
	}

	private void Close_Click(object sender, EventArgs e)
	{
		if (MainMenuForm.TestHydraulic > -1)
		{
			Comand.Enqueue("H-POD:DISABLE");
			ChangeStateReport(MainMenuForm.COM[MainMenuForm.TestHydraulic], enable: false, 6000.0);
		}
		if (thisServer != null)
		{
			thisServer.Stop();
		}
		Close();
	}

	private void GaugeRefresh(PictureBox gauge)
	{
		Bitmap image = new Bitmap(gauge.Bounds.Width, gauge.Bounds.Height);
		Graphics graphics = Graphics.FromImage(image);
		float num = 150f;
		float num2 = 124f;
		float offsetX = 31f;
		float offsetY = 40f;
		Matrix matrix = new Matrix();
		matrix.RotateAt(18f + 234f * (float)((double[])gauge.Tag)[0] / 400f, new PointF(num, num2));
		matrix.Translate(offsetX, offsetY, MatrixOrder.Append);
		graphics.Transform = matrix;
		graphics.DrawImage(Lancetta, 0, 0);
		if (GaugePump.Equals(gauge))
		{
			LinearGradientBrush gradientPump = GradientPump;
		}
		else
		{
			LinearGradientBrush gradientPump = GradientChannel;
		}
		matrix = new Matrix();
		graphics.Transform = matrix;
		graphics.FillRectangle(GradientPump, 0f, gauge.Height - 22, (float)((double[])gauge.Tag)[0] * (float)gauge.Width / 400f, gauge.Height);
		if (RefreshGaige.Count > 0)
		{
			RefreshGaige.Dequeue();
		}
		string text = ((int)((double[])gauge.Tag)[0]).ToString().PadLeft(3, ' ');
		if (MainMenuForm.User)
		{
			text = ((!GaugePump.Equals(gauge)) ? (text + "|" + ((int)((double[])gauge.Tag)[1]).ToString().PadLeft(3, ' ')) : (text + "|" + ((int)Measure).ToString().PadLeft(3, ' ')));
		}
		SizeF sizeF = graphics.MeasureString(text, FontChannel);
		graphics.DrawString(text, FontChannel, Brushes.White, ((float)gauge.Width - sizeF.Width) / 2f + 4f, (float)gauge.Height - sizeF.Height - 20f);
		gauge.Image = image;
	}

	private void Printer_BeginPrint(object sender, PrintEventArgs e)
	{
		Colum = 0;
		PrintReport.Clear();
		string[] array = Report.Report.Text.Split('\n');
		foreach (string text in array)
		{
			PrintReport.Enqueue(text + "\n");
		}
		if (!Report.Printer.IsPreview)
		{
			SaveReportDialog.InitialDirectory = Directory.GetParent(Environment.GetFolderPath(Environment.SpecialFolder.Personal)).FullName + "\\Documents";
			if (Report.Printer.PrinterName == "Microsoft Print to PDF")
			{
				if (SaveReportDialog.ShowDialog() == DialogResult.OK)
				{
					Report.Printer.PrintFileName = SaveReportDialog.FileName;
					Report.Printer.PrintToFile = true;
					Directory.SetCurrentDirectory(Application.StartupPath);
				}
				else
				{
					e.Cancel = true;
				}
			}
		}
		else if (WindowCompany == null)
		{
			WindowCompany = new FormCompany(ClientSelected);
			WindowCompany.ShowDialog();
			ClientSelected = WindowCompany.ID;
		}
	}

	private void Printer_PrintPage(object sender, PrintPageEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Bitmap bitmap = ((!File.Exists("Logo1.jpg")) ? new Bitmap("Logo.jpg") : new Bitmap("Logo1.jpg"));
		RectangleF srcRect = new RectangleF(new Point(0, 0), bitmap.Size);
		Rectangle rectangle = new Rectangle(new Point(8, 7), new Size(280, 100));
		FormCompany windowCompany = WindowCompany;
		if (windowCompany.InsertLOGO.Checked)
		{
			graphics.DrawImage(bitmap, rectangle, srcRect, GraphicsUnit.Pixel);
		}
		Font font = new Font(FontFamily.GenericMonospace, 10f, FontStyle.Bold);
		Font font2 = new Font("Microsoft Sans Serif", 10f, FontStyle.Bold);
		Font font3 = new Font("Century", 10f, FontStyle.Regular);
		float num = 0.8f;
		float num2 = 400f;
		float num3 = 9f;
		rectangle = new Rectangle(new Point(0, 0), new Size(e.MarginBounds.Width, e.MarginBounds.Height));
		graphics.DrawRectangle(Pens.Black, rectangle);
		rectangle = new Rectangle(new Point(0, 0), new Size(e.MarginBounds.Width, 107));
		graphics.DrawRectangle(Pens.Black, rectangle);
		graphics.DrawRectangle(rect: new Rectangle(new Point(0, 0), new Size(350, 107)), pen: Pens.Black);
		graphics.DrawString(windowCompany.BusinessName.Text, font2, Brushes.Black, new PointF(num2, num3));
		num3 += graphics.MeasureString("CompanyName", font2).Height * num;
		graphics.DrawString(windowCompany.Address.Text, font3, Brushes.Black, new PointF(num2, num3));
		num3 += graphics.MeasureString("Address", font3).Height * num;
		graphics.DrawString(windowCompany.CAP.Text + " " + windowCompany.City.Text + " (" + windowCompany.Province.Text + ")", font3, Brushes.Black, new PointF(num2, num3));
		num3 += graphics.MeasureString("City", font3).Height * num;
		graphics.DrawString("VAT: " + windowCompany.VATNumber.Text, font3, Brushes.Black, new PointF(num2, num3));
		num3 += graphics.MeasureString("VATNumber", font3).Height * num;
		if (windowCompany.Phone.Text != null && windowCompany.Phone.Text != "")
		{
			graphics.DrawString("Phone: " + windowCompany.Phone.Text, font3, Brushes.Black, new PointF(num2, num3));
			num3 += graphics.MeasureString("Phone", font3).Height * num;
		}
		else
		{
			graphics.DrawString("Mobile: " + windowCompany.Mobile.Text, font3, Brushes.Black, new PointF(num2, num3));
			num3 += graphics.MeasureString("Mobile", font3).Height * num;
		}
		graphics.DrawString("Email: " + windowCompany.Email.Text, font3, Brushes.Black, new PointF(num2, num3));
		num3 += graphics.MeasureString("Email", font3).Height * num;
		byte b = 0;
		int num4 = 0;
		SolidBrush brush = new SolidBrush(Color.DarkOrange);
		while (PrintReport.Count > 0)
		{
			string text = PrintReport.Dequeue().Replace("\r", "").Replace("\n", "")
				.Trim();
			int num5 = -1;
			if (text.IndexOf("Valve") == 0 && text.IndexOf("closure") == -1)
			{
				if (!IsResistorChecked)
				{
					continue;
				}
				if (text.IndexOf("Valve1:") > -1 && num4 < 38)
				{
					num4++;
				}
				if (text.IndexOf("Ok") > -1)
				{
					brush = new SolidBrush(Color.Green);
				}
				else if (text.IndexOf(";") == -1)
				{
					brush = new SolidBrush(Color.Red);
				}
				else if (text.IndexOf("Fault") > -1 && text.IndexOf(';') > -1)
				{
					num5 = text.IndexOf(';') + 1;
					b = byte.Parse(text.Substring(num5).Trim());
					b++;
					if (b <= 10)
					{
						brush = new SolidBrush(Color.Red);
					}
					else if (b > 10 && b <= 15)
					{
						brush = new SolidBrush(Color.DarkOrange);
					}
				}
				else
				{
					brush = new SolidBrush(Color.Green);
				}
			}
			else
			{
				brush = new SolidBrush(Color.Black);
			}
			if (num5 > -1 && !MainMenuForm.User && (b <= 10 || b > 15))
			{
				text = text.Substring(0, num5 - 1).Trim();
			}
			graphics.DrawString(text, font, brush, new PointF(5f + (float)Colum * ((float)e.PageBounds.Width / 2.1f), num3 + 30f + (float)(num4 * 23)));
			if (num4 == 38)
			{
				if (Colum != 0)
				{
					Colum = 0;
					break;
				}
				num4 = 0;
				Colum = 1;
			}
			else
			{
				num4++;
			}
		}
		e.HasMorePages = PrintReport.Count > 0;
		windowCompany.Close();
		windowCompany.Dispose();
		windowCompany = null;
	}

	private void Printer_EndPrint(object sender, PrintEventArgs e)
	{
		if (!Report.Printer.IsPreview)
		{
			Report.Printer.Close();
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
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SC_F2_EVO.FormHydraulicBench));
		this.Print = new System.Windows.Forms.PictureBox();
		this.Motor = new System.Windows.Forms.PictureBox();
		this.HydraulicTest = new System.Windows.Forms.PictureBox();
		this.Cycle = new System.Windows.Forms.PictureBox();
		this.Current = new System.Windows.Forms.PictureBox();
		this.Temperature = new System.Windows.Forms.PictureBox();
		this.Program = new System.Windows.Forms.PictureBox();
		this.Send = new System.Windows.Forms.Timer(this.components);
		this.UpLoad = new System.Windows.Forms.Button();
		this.btnHydraulicLoad = new System.Windows.Forms.Button();
		this.btnTerminal = new System.Windows.Forms.Button();
		this.Reset = new System.Windows.Forms.Button();
		this.GetABS = new System.Windows.Forms.Button();
		this.Clear = new System.Windows.Forms.Button();
		this.Close = new System.Windows.Forms.PictureBox();
		this.Error = new System.Windows.Forms.Label();
		this.Warning = new System.Windows.Forms.Label();
		this.GaugePump = new System.Windows.Forms.PictureBox();
		this.Gauge1 = new System.Windows.Forms.PictureBox();
		this.Gauge2 = new System.Windows.Forms.PictureBox();
		this.Gauge3 = new System.Windows.Forms.PictureBox();
		this.Gauge4 = new System.Windows.Forms.PictureBox();
		this.Bleeding = new System.Windows.Forms.PictureBox();
		this.Model = new System.Windows.Forms.Label();
		this.ErrorCOMM = new System.Windows.Forms.Label();
		this.TimeOUT = new System.Windows.Forms.Timer(this.components);
		this.txtClock = new System.Windows.Forms.PictureBox();
		this.Testing = new System.Windows.Forms.PictureBox();
		this.Progress = new System.Windows.Forms.PictureBox();
		this.Diagnostic = new System.Windows.Forms.Button();
		this.Floater = new System.Windows.Forms.PictureBox();
		this.Clock = new System.Windows.Forms.Timer(this.components);
		this.Active = new System.Windows.Forms.Timer(this.components);
		this.SendReportTimer = new System.Windows.Forms.Timer(this.components);
		this.Stop = new System.Windows.Forms.PictureBox();
		this.Minus = new System.Windows.Forms.PictureBox();
		this.Plus = new System.Windows.Forms.PictureBox();
		this.OnOff = new System.Windows.Forms.PictureBox();
		this.Valves = new System.Windows.Forms.PictureBox();
		this.Company = new System.Windows.Forms.Label();
		this.GroupControl = new System.Windows.Forms.GroupBox();
		this.Oil = new System.Windows.Forms.Button();
		this.Canali = new System.Windows.Forms.Button();
		this.T4 = new System.Windows.Forms.PictureBox();
		this.T3 = new System.Windows.Forms.PictureBox();
		this.T2 = new System.Windows.Forms.PictureBox();
		this.T1 = new System.Windows.Forms.PictureBox();
		this.Disconnect = new System.Windows.Forms.Button();
		this.DownLoad = new System.Windows.Forms.PictureBox();
		this.SaveReportDialog = new System.Windows.Forms.SaveFileDialog();
		this.LoadCicles = new System.Windows.Forms.Timer(this.components);
		this.RefreshStatus = new System.Windows.Forms.Timer(this.components);
		this.SendCommand = new System.Windows.Forms.Timer(this.components);
		((System.ComponentModel.ISupportInitialize)this.Print).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Motor).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.HydraulicTest).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Cycle).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Current).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Temperature).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Program).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Close).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.GaugePump).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge1).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge2).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge3).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge4).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Bleeding).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.txtClock).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Testing).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Progress).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Floater).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Stop).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Minus).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Plus).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.OnOff).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Valves).BeginInit();
		this.GroupControl.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.T4).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.T3).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.T2).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.T1).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.DownLoad).BeginInit();
		base.SuspendLayout();
		this.Print.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Print.BackColor = System.Drawing.SystemColors.Control;
		this.Print.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Print.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Print.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Print.ForeColor = System.Drawing.SystemColors.Control;
		this.Print.Location = new System.Drawing.Point(173, 644);
		this.Print.Name = "Print";
		this.Print.Size = new System.Drawing.Size(120, 75);
		this.Print.TabIndex = 9;
		this.Print.TabStop = false;
		this.Print.Tag = "PRINTREPORT";
		this.Print.Text = "Report";
		this.Print.Click += new System.EventHandler(Send_Click);
		this.Motor.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Motor.BackColor = System.Drawing.SystemColors.Control;
		this.Motor.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Motor.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Motor.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Motor.ForeColor = System.Drawing.SystemColors.Control;
		this.Motor.Location = new System.Drawing.Point(16, 733);
		this.Motor.Name = "Motor";
		this.Motor.Size = new System.Drawing.Size(120, 75);
		this.Motor.TabIndex = 10;
		this.Motor.TabStop = false;
		this.Motor.Tag = "MOTOR";
		this.Motor.Text = "Motor";
		this.Motor.Click += new System.EventHandler(Send_Click);
		this.HydraulicTest.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.HydraulicTest.BackColor = System.Drawing.SystemColors.Control;
		this.HydraulicTest.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.HydraulicTest.Cursor = System.Windows.Forms.Cursors.Hand;
		this.HydraulicTest.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.HydraulicTest.ForeColor = System.Drawing.SystemColors.Control;
		this.HydraulicTest.Location = new System.Drawing.Point(176, 733);
		this.HydraulicTest.Name = "HydraulicTest";
		this.HydraulicTest.Size = new System.Drawing.Size(120, 75);
		this.HydraulicTest.TabIndex = 11;
		this.HydraulicTest.TabStop = false;
		this.HydraulicTest.Tag = "PRESSURE";
		this.HydraulicTest.Text = "Hydraulic Test";
		this.HydraulicTest.Click += new System.EventHandler(Send_Click);
		this.Cycle.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Cycle.BackColor = System.Drawing.SystemColors.Control;
		this.Cycle.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Cycle.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Cycle.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cycle.ForeColor = System.Drawing.SystemColors.Control;
		this.Cycle.Location = new System.Drawing.Point(16, 814);
		this.Cycle.Name = "Cycle";
		this.Cycle.Size = new System.Drawing.Size(120, 75);
		this.Cycle.TabIndex = 12;
		this.Cycle.TabStop = false;
		this.Cycle.Tag = "H-CYCLES";
		this.Cycle.Text = "Cycle";
		this.Cycle.Click += new System.EventHandler(Send_Click);
		this.Current.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Current.BackColor = System.Drawing.Color.Black;
		this.Current.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold);
		this.Current.ForeColor = System.Drawing.Color.White;
		this.Current.Location = new System.Drawing.Point(1561, 522);
		this.Current.Name = "Current";
		this.Current.Size = new System.Drawing.Size(126, 39);
		this.Current.TabIndex = 2;
		this.Current.TabStop = false;
		this.Current.Tag = "0.0A";
		this.Current.Text = "0";
		this.Temperature.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Temperature.BackColor = System.Drawing.Color.Black;
		this.Temperature.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold);
		this.Temperature.ForeColor = System.Drawing.Color.White;
		this.Temperature.Location = new System.Drawing.Point(1805, 522);
		this.Temperature.Name = "Temperature";
		this.Temperature.Size = new System.Drawing.Size(90, 39);
		this.Temperature.TabIndex = 3;
		this.Temperature.TabStop = false;
		this.Temperature.Tag = "0°";
		this.Program.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Program.BackColor = System.Drawing.SystemColors.Control;
		this.Program.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Program.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Program.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Program.ForeColor = System.Drawing.SystemColors.Control;
		this.Program.Location = new System.Drawing.Point(173, 814);
		this.Program.Name = "Program";
		this.Program.Size = new System.Drawing.Size(120, 75);
		this.Program.TabIndex = 13;
		this.Program.TabStop = false;
		this.Program.Tag = "SHORTCYCLES";
		this.Program.Text = "Programs\r\nCycle";
		this.Program.Click += new System.EventHandler(Program_Click);
		this.Send.Interval = 200;
		this.Send.Tick += new System.EventHandler(Send_Tick);
		this.UpLoad.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.UpLoad.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.UpLoad.Location = new System.Drawing.Point(145, 108);
		this.UpLoad.Name = "UpLoad";
		this.UpLoad.Size = new System.Drawing.Size(109, 30);
		this.UpLoad.TabIndex = 15;
		this.UpLoad.Tag = "PRINT";
		this.UpLoad.Text = "Pubblica";
		this.UpLoad.UseVisualStyleBackColor = true;
		this.UpLoad.Click += new System.EventHandler(UpLoad_Click);
		this.btnHydraulicLoad.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.btnHydraulicLoad.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.btnHydraulicLoad.Location = new System.Drawing.Point(6, 108);
		this.btnHydraulicLoad.Name = "btnHydraulicLoad";
		this.btnHydraulicLoad.Size = new System.Drawing.Size(132, 30);
		this.btnHydraulicLoad.TabIndex = 16;
		this.btnHydraulicLoad.Tag = "PRINT";
		this.btnHydraulicLoad.Text = "Hydraulic Load";
		this.btnHydraulicLoad.UseVisualStyleBackColor = true;
		this.btnHydraulicLoad.Click += new System.EventHandler(btnHydraulicLoad_Click);
		this.btnTerminal.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.btnTerminal.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.btnTerminal.Location = new System.Drawing.Point(145, 78);
		this.btnTerminal.Name = "btnTerminal";
		this.btnTerminal.Size = new System.Drawing.Size(109, 30);
		this.btnTerminal.TabIndex = 17;
		this.btnTerminal.Tag = "PRINT";
		this.btnTerminal.Text = "Terminal";
		this.btnTerminal.UseVisualStyleBackColor = true;
		this.btnTerminal.Click += new System.EventHandler(btnTerminal_Click);
		this.Reset.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Reset.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Reset.Location = new System.Drawing.Point(145, 48);
		this.Reset.Name = "Reset";
		this.Reset.Size = new System.Drawing.Size(109, 30);
		this.Reset.TabIndex = 32;
		this.Reset.Text = "Reset uP";
		this.Reset.UseVisualStyleBackColor = true;
		this.Reset.Click += new System.EventHandler(Reset_Click);
		this.GetABS.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.GetABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.GetABS.Location = new System.Drawing.Point(6, 78);
		this.GetABS.Name = "GetABS";
		this.GetABS.Size = new System.Drawing.Size(132, 30);
		this.GetABS.TabIndex = 33;
		this.GetABS.Tag = "H-GETMODEL";
		this.GetABS.Text = "Get ABS model";
		this.GetABS.UseVisualStyleBackColor = true;
		this.GetABS.Click += new System.EventHandler(GetABS_Click);
		this.Clear.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Clear.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Clear.Location = new System.Drawing.Point(6, 48);
		this.Clear.Name = "Clear";
		this.Clear.Size = new System.Drawing.Size(132, 30);
		this.Clear.TabIndex = 34;
		this.Clear.Text = "Clear Report";
		this.Clear.UseVisualStyleBackColor = true;
		this.Clear.Click += new System.EventHandler(Clear_Click);
		this.Close.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.Close.BackColor = System.Drawing.Color.Transparent;
		this.Close.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
		this.Close.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Close.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Close.Location = new System.Drawing.Point(1825, 859);
		this.Close.Name = "Close";
		this.Close.Size = new System.Drawing.Size(93, 38);
		this.Close.TabIndex = 35;
		this.Close.TabStop = false;
		this.Close.Tag = "PRINT";
		this.Close.Click += new System.EventHandler(Close_Click);
		this.Error.AllowDrop = true;
		this.Error.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Error.AutoSize = true;
		this.Error.BackColor = System.Drawing.Color.Transparent;
		this.Error.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Error.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Error.ForeColor = System.Drawing.Color.Red;
		this.Error.Location = new System.Drawing.Point(735, 718);
		this.Error.Name = "Error";
		this.Error.Size = new System.Drawing.Size(0, 39);
		this.Error.TabIndex = 41;
		this.Error.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Warning.AllowDrop = true;
		this.Warning.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Warning.BackColor = System.Drawing.Color.Transparent;
		this.Warning.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Warning.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Warning.ForeColor = System.Drawing.Color.Orange;
		this.Warning.Location = new System.Drawing.Point(311, 842);
		this.Warning.Name = "Warning";
		this.Warning.Size = new System.Drawing.Size(1315, 39);
		this.Warning.TabIndex = 42;
		this.Warning.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.GaugePump.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.GaugePump.Location = new System.Drawing.Point(754, 138);
		this.GaugePump.Name = "GaugePump";
		this.GaugePump.Size = new System.Drawing.Size(363, 326);
		this.GaugePump.TabIndex = 43;
		this.GaugePump.TabStop = false;
		this.Gauge1.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Gauge1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Gauge1.Location = new System.Drawing.Point(16, 138);
		this.Gauge1.Name = "Gauge1";
		this.Gauge1.Size = new System.Drawing.Size(363, 326);
		this.Gauge1.TabIndex = 44;
		this.Gauge1.TabStop = false;
		this.Gauge2.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Gauge2.BackColor = System.Drawing.SystemColors.Control;
		this.Gauge2.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Gauge2.Location = new System.Drawing.Point(385, 138);
		this.Gauge2.Name = "Gauge2";
		this.Gauge2.Size = new System.Drawing.Size(363, 326);
		this.Gauge2.TabIndex = 45;
		this.Gauge2.TabStop = false;
		this.Gauge3.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Gauge3.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Gauge3.Location = new System.Drawing.Point(1123, 138);
		this.Gauge3.Name = "Gauge3";
		this.Gauge3.Size = new System.Drawing.Size(363, 326);
		this.Gauge3.TabIndex = 46;
		this.Gauge3.TabStop = false;
		this.Gauge4.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Gauge4.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Gauge4.Location = new System.Drawing.Point(1492, 138);
		this.Gauge4.Name = "Gauge4";
		this.Gauge4.Size = new System.Drawing.Size(363, 326);
		this.Gauge4.TabIndex = 47;
		this.Gauge4.TabStop = false;
		this.Bleeding.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Bleeding.BackColor = System.Drawing.SystemColors.Control;
		this.Bleeding.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Bleeding.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Bleeding.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Bleeding.ForeColor = System.Drawing.SystemColors.Control;
		this.Bleeding.Location = new System.Drawing.Point(19, 652);
		this.Bleeding.Name = "Bleeding";
		this.Bleeding.Size = new System.Drawing.Size(120, 75);
		this.Bleeding.TabIndex = 49;
		this.Bleeding.TabStop = false;
		this.Bleeding.Tag = "BLEEDING";
		this.Bleeding.Text = "Bleeding";
		this.Bleeding.Click += new System.EventHandler(Send_Click);
		this.Model.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Model.BackColor = System.Drawing.Color.Transparent;
		this.Model.Font = new System.Drawing.Font("Microsoft Sans Serif", 24f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Model.ForeColor = System.Drawing.Color.White;
		this.Model.Location = new System.Drawing.Point(17, 583);
		this.Model.Name = "Model";
		this.Model.Size = new System.Drawing.Size(394, 41);
		this.Model.TabIndex = 50;
		this.Model.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.ErrorCOMM.AutoSize = true;
		this.ErrorCOMM.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ErrorCOMM.ForeColor = System.Drawing.Color.Red;
		this.ErrorCOMM.Location = new System.Drawing.Point(1770, 52);
		this.ErrorCOMM.Name = "ErrorCOMM";
		this.ErrorCOMM.Size = new System.Drawing.Size(0, 16);
		this.ErrorCOMM.TabIndex = 51;
		this.ErrorCOMM.Visible = false;
		this.TimeOUT.Interval = 6000;
		this.TimeOUT.Tick += new System.EventHandler(TimeOUT_Tick);
		this.txtClock.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.txtClock.BackColor = System.Drawing.Color.Transparent;
		this.txtClock.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold);
		this.txtClock.ForeColor = System.Drawing.Color.White;
		this.txtClock.Location = new System.Drawing.Point(1005, 72);
		this.txtClock.Name = "txtClock";
		this.txtClock.Size = new System.Drawing.Size(32, 39);
		this.txtClock.TabIndex = 52;
		this.txtClock.TabStop = false;
		this.txtClock.Paint += new System.Windows.Forms.PaintEventHandler(txtClock_Paint);
		this.Testing.AllowDrop = true;
		this.Testing.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Testing.BackColor = System.Drawing.SystemColors.Control;
		this.Testing.Font = new System.Drawing.Font("Microsoft Sans Serif", 30f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Testing.ForeColor = System.Drawing.Color.White;
		this.Testing.Location = new System.Drawing.Point(555, 583);
		this.Testing.Name = "Testing";
		this.Testing.Size = new System.Drawing.Size(931, 55);
		this.Testing.TabIndex = 53;
		this.Testing.TabStop = false;
		this.Testing.Tag = "Testing";
		this.Progress.AllowDrop = true;
		this.Progress.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Progress.BackColor = System.Drawing.Color.MediumSeaGreen;
		this.Progress.Font = new System.Drawing.Font("Courier New", 14f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Progress.ForeColor = System.Drawing.Color.White;
		this.Progress.Location = new System.Drawing.Point(377, 614);
		this.Progress.Name = "Progress";
		this.Progress.Size = new System.Drawing.Size(153, 25);
		this.Progress.TabIndex = 54;
		this.Progress.TabStop = false;
		this.Progress.Tag = "0";
		this.Diagnostic.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Diagnostic.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Diagnostic.Location = new System.Drawing.Point(145, 18);
		this.Diagnostic.Name = "Diagnostic";
		this.Diagnostic.Size = new System.Drawing.Size(109, 30);
		this.Diagnostic.TabIndex = 56;
		this.Diagnostic.Text = "Diagnostic";
		this.Diagnostic.UseVisualStyleBackColor = true;
		this.Diagnostic.Click += new System.EventHandler(Diagnostic_Click);
		this.Floater.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Floater.BackColor = System.Drawing.Color.Black;
		this.Floater.Font = new System.Drawing.Font("Microsoft Sans Serif", 28.25f, System.Drawing.FontStyle.Bold);
		this.Floater.ForeColor = System.Drawing.Color.White;
		this.Floater.Location = new System.Drawing.Point(1422, 522);
		this.Floater.Name = "Floater";
		this.Floater.Size = new System.Drawing.Size(79, 39);
		this.Floater.TabIndex = 57;
		this.Floater.TabStop = false;
		this.Floater.Tag = "1";
		this.Floater.Text = "0";
		this.Clock.Enabled = true;
		this.Clock.Interval = 60000;
		this.Clock.Tick += new System.EventHandler(Clock_Tick);
		this.Active.Tick += new System.EventHandler(Active_Tick);
		this.SendReportTimer.Interval = 300;
		this.SendReportTimer.Tick += new System.EventHandler(SendReportTimer_Tick);
		this.Stop.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Stop.BackColor = System.Drawing.SystemColors.Control;
		this.Stop.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Stop.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Stop.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Stop.ForeColor = System.Drawing.SystemColors.Control;
		this.Stop.Location = new System.Drawing.Point(19, 563);
		this.Stop.Name = "Stop";
		this.Stop.Size = new System.Drawing.Size(117, 75);
		this.Stop.TabIndex = 59;
		this.Stop.TabStop = false;
		this.Stop.Tag = "Print";
		this.Stop.Text = "Stop";
		this.Stop.Click += new System.EventHandler(Reset_Click);
		this.Minus.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Minus.BackColor = System.Drawing.SystemColors.Control;
		this.Minus.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Minus.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Minus.ForeColor = System.Drawing.SystemColors.Control;
		this.Minus.Location = new System.Drawing.Point(784, 361);
		this.Minus.Name = "Minus";
		this.Minus.Size = new System.Drawing.Size(72, 68);
		this.Minus.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.Minus.TabIndex = 60;
		this.Minus.TabStop = false;
		this.Minus.Tag = "";
		this.Minus.Text = "pictureBox1";
		this.Minus.Visible = false;
		this.Minus.Click += new System.EventHandler(StepMotor);
		this.Plus.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Plus.BackColor = System.Drawing.SystemColors.Control;
		this.Plus.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Plus.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Plus.ForeColor = System.Drawing.SystemColors.Control;
		this.Plus.Location = new System.Drawing.Point(1036, 361);
		this.Plus.Name = "Plus";
		this.Plus.Size = new System.Drawing.Size(72, 68);
		this.Plus.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.Plus.TabIndex = 61;
		this.Plus.TabStop = false;
		this.Plus.Tag = "";
		this.Plus.Text = "pictureBox2";
		this.Plus.Visible = false;
		this.Plus.Click += new System.EventHandler(StepMotor);
		this.OnOff.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.OnOff.BackColor = System.Drawing.SystemColors.Control;
		this.OnOff.Cursor = System.Windows.Forms.Cursors.Hand;
		this.OnOff.Font = new System.Drawing.Font("Stencil", 26f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.OnOff.ForeColor = System.Drawing.SystemColors.Control;
		this.OnOff.Location = new System.Drawing.Point(910, 361);
		this.OnOff.Name = "OnOff";
		this.OnOff.Size = new System.Drawing.Size(72, 68);
		this.OnOff.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
		this.OnOff.TabIndex = 62;
		this.OnOff.TabStop = false;
		this.OnOff.Tag = "ON";
		this.OnOff.Text = "pictureBox1";
		this.OnOff.Visible = false;
		this.OnOff.Click += new System.EventHandler(OnOff_Click);
		this.OnOff.Paint += new System.Windows.Forms.PaintEventHandler(OnOff_Paint);
		this.Valves.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Valves.BackColor = System.Drawing.SystemColors.Control;
		this.Valves.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Valves.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Valves.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valves.ForeColor = System.Drawing.SystemColors.Control;
		this.Valves.Location = new System.Drawing.Point(176, 563);
		this.Valves.Name = "Valves";
		this.Valves.Size = new System.Drawing.Size(120, 75);
		this.Valves.TabIndex = 64;
		this.Valves.TabStop = false;
		this.Valves.Tag = "VALVES";
		this.Valves.Text = "Valves";
		this.Valves.Click += new System.EventHandler(Send_Click);
		this.Company.AutoSize = true;
		this.Company.BackColor = System.Drawing.Color.Transparent;
		this.Company.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Company.ForeColor = System.Drawing.Color.White;
		this.Company.Location = new System.Drawing.Point(1005, 31);
		this.Company.Name = "Company";
		this.Company.Size = new System.Drawing.Size(173, 39);
		this.Company.TabIndex = 65;
		this.Company.Text = "Company";
		this.GroupControl.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.GroupControl.Controls.Add(this.Oil);
		this.GroupControl.Controls.Add(this.Canali);
		this.GroupControl.Controls.Add(this.UpLoad);
		this.GroupControl.Controls.Add(this.btnHydraulicLoad);
		this.GroupControl.Controls.Add(this.btnTerminal);
		this.GroupControl.Controls.Add(this.Reset);
		this.GroupControl.Controls.Add(this.GetABS);
		this.GroupControl.Controls.Add(this.Clear);
		this.GroupControl.Controls.Add(this.Diagnostic);
		this.GroupControl.Font = new System.Drawing.Font("Microsoft Sans Serif", 15.75f, System.Drawing.FontStyle.Bold);
		this.GroupControl.Location = new System.Drawing.Point(1658, 667);
		this.GroupControl.Name = "GroupControl";
		this.GroupControl.Size = new System.Drawing.Size(260, 141);
		this.GroupControl.TabIndex = 66;
		this.GroupControl.TabStop = false;
		this.Oil.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Oil.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Oil.Location = new System.Drawing.Point(79, 18);
		this.Oil.Name = "Oil";
		this.Oil.Size = new System.Drawing.Size(59, 30);
		this.Oil.TabIndex = 58;
		this.Oil.Text = "Oil";
		this.Oil.UseVisualStyleBackColor = true;
		this.Oil.Click += new System.EventHandler(Oil_Click);
		this.Canali.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Canali.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Canali.Location = new System.Drawing.Point(6, 18);
		this.Canali.Name = "Canali";
		this.Canali.Size = new System.Drawing.Size(71, 30);
		this.Canali.TabIndex = 57;
		this.Canali.Text = "Canali";
		this.Canali.UseVisualStyleBackColor = true;
		this.Canali.Click += new System.EventHandler(Canali_Click);
		this.T4.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.T4.BackColor = System.Drawing.Color.Transparent;
		this.T4.Cursor = System.Windows.Forms.Cursors.Hand;
		this.T4.Enabled = false;
		this.T4.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.T4.Location = new System.Drawing.Point(1648, 858);
		this.T4.Name = "T4";
		this.T4.Size = new System.Drawing.Size(39, 35);
		this.T4.TabIndex = 61;
		this.T4.TabStop = false;
		this.T4.Tag = "3";
		this.T4.Click += new System.EventHandler(Test_Click);
		this.T3.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.T3.BackColor = System.Drawing.Color.Transparent;
		this.T3.Cursor = System.Windows.Forms.Cursors.Hand;
		this.T3.Enabled = false;
		this.T3.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.T3.Location = new System.Drawing.Point(1606, 858);
		this.T3.Name = "T3";
		this.T3.Size = new System.Drawing.Size(39, 35);
		this.T3.TabIndex = 60;
		this.T3.TabStop = false;
		this.T3.Tag = "2";
		this.T3.Click += new System.EventHandler(Test_Click);
		this.T2.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.T2.BackColor = System.Drawing.Color.Transparent;
		this.T2.Cursor = System.Windows.Forms.Cursors.Hand;
		this.T2.Enabled = false;
		this.T2.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.T2.Location = new System.Drawing.Point(1561, 858);
		this.T2.Name = "T2";
		this.T2.Size = new System.Drawing.Size(39, 35);
		this.T2.TabIndex = 59;
		this.T2.TabStop = false;
		this.T2.Tag = "1";
		this.T2.Click += new System.EventHandler(Test_Click);
		this.T1.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.T1.BackColor = System.Drawing.Color.Transparent;
		this.T1.Cursor = System.Windows.Forms.Cursors.Hand;
		this.T1.Enabled = false;
		this.T1.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.T1.Location = new System.Drawing.Point(1519, 858);
		this.T1.Name = "T1";
		this.T1.Size = new System.Drawing.Size(39, 35);
		this.T1.TabIndex = 58;
		this.T1.TabStop = false;
		this.T1.Tag = "0";
		this.T1.Click += new System.EventHandler(Test_Click);
		this.Disconnect.BackColor = System.Drawing.Color.Transparent;
		this.Disconnect.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Disconnect.Enabled = false;
		this.Disconnect.FlatAppearance.BorderColor = System.Drawing.Color.LimeGreen;
		this.Disconnect.FlatAppearance.BorderSize = 0;
		this.Disconnect.FlatAppearance.MouseDownBackColor = System.Drawing.Color.Transparent;
		this.Disconnect.FlatAppearance.MouseOverBackColor = System.Drawing.Color.Transparent;
		this.Disconnect.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
		this.Disconnect.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Disconnect.Location = new System.Drawing.Point(403, 783);
		this.Disconnect.Name = "Disconnect";
		this.Disconnect.Size = new System.Drawing.Size(105, 75);
		this.Disconnect.TabIndex = 57;
		this.Disconnect.TextAlign = System.Drawing.ContentAlignment.BottomCenter;
		this.Disconnect.UseVisualStyleBackColor = false;
		this.Disconnect.Click += new System.EventHandler(Disconnect_Click);
		this.DownLoad.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.DownLoad.BackColor = System.Drawing.Color.Transparent;
		this.DownLoad.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
		this.DownLoad.Cursor = System.Windows.Forms.Cursors.Hand;
		this.DownLoad.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.DownLoad.Location = new System.Drawing.Point(1715, 859);
		this.DownLoad.Name = "DownLoad";
		this.DownLoad.Size = new System.Drawing.Size(93, 38);
		this.DownLoad.TabIndex = 58;
		this.DownLoad.TabStop = false;
		this.DownLoad.Tag = "PRINT";
		this.DownLoad.Click += new System.EventHandler(DownLoad_Click);
		this.SaveReportDialog.DefaultExt = "pdf";
		this.SaveReportDialog.Filter = "PDF File|*.pdf";
		this.LoadCicles.Interval = 1100;
		this.LoadCicles.Tick += new System.EventHandler(LoadCicles_Tick);
		this.RefreshStatus.Interval = 1;
		this.RefreshStatus.Tick += new System.EventHandler(RefreshStatus_Tick);
		this.SendCommand.Interval = 500;
		this.SendCommand.Tick += new System.EventHandler(SendCommand_Tick);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		this.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		base.ClientSize = new System.Drawing.Size(1919, 901);
		base.Controls.Add(this.T4);
		base.Controls.Add(this.Disconnect);
		base.Controls.Add(this.T3);
		base.Controls.Add(this.DownLoad);
		base.Controls.Add(this.T2);
		base.Controls.Add(this.Close);
		base.Controls.Add(this.T1);
		base.Controls.Add(this.GroupControl);
		base.Controls.Add(this.Company);
		base.Controls.Add(this.Valves);
		base.Controls.Add(this.OnOff);
		base.Controls.Add(this.Plus);
		base.Controls.Add(this.Minus);
		base.Controls.Add(this.Stop);
		base.Controls.Add(this.Floater);
		base.Controls.Add(this.Progress);
		base.Controls.Add(this.Testing);
		base.Controls.Add(this.txtClock);
		base.Controls.Add(this.ErrorCOMM);
		base.Controls.Add(this.Model);
		base.Controls.Add(this.Bleeding);
		base.Controls.Add(this.Gauge4);
		base.Controls.Add(this.Gauge3);
		base.Controls.Add(this.Gauge2);
		base.Controls.Add(this.Gauge1);
		base.Controls.Add(this.GaugePump);
		base.Controls.Add(this.Warning);
		base.Controls.Add(this.Error);
		base.Controls.Add(this.Program);
		base.Controls.Add(this.Temperature);
		base.Controls.Add(this.Current);
		base.Controls.Add(this.Cycle);
		base.Controls.Add(this.HydraulicTest);
		base.Controls.Add(this.Motor);
		base.Controls.Add(this.Print);
		this.Cursor = System.Windows.Forms.Cursors.Default;
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.Name = "FormHydraulicBench";
		base.Opacity = 0.0;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Test Bench ABS";
		base.Activated += new System.EventHandler(FormHydraulicBench_Activated);
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(FormHydraulicBench_FormClosing);
		base.FormClosed += new System.Windows.Forms.FormClosedEventHandler(FormHydraulicBench_FormClosed);
		base.Load += new System.EventHandler(FormBench_Load);
		((System.ComponentModel.ISupportInitialize)this.Print).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Motor).EndInit();
		((System.ComponentModel.ISupportInitialize)this.HydraulicTest).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Cycle).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Current).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Temperature).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Program).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Close).EndInit();
		((System.ComponentModel.ISupportInitialize)this.GaugePump).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge1).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge2).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge3).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Gauge4).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Bleeding).EndInit();
		((System.ComponentModel.ISupportInitialize)this.txtClock).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Testing).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Progress).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Floater).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Stop).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Minus).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Plus).EndInit();
		((System.ComponentModel.ISupportInitialize)this.OnOff).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Valves).EndInit();
		this.GroupControl.ResumeLayout(false);
		((System.ComponentModel.ISupportInitialize)this.T4).EndInit();
		((System.ComponentModel.ISupportInitialize)this.T3).EndInit();
		((System.ComponentModel.ISupportInitialize)this.T2).EndInit();
		((System.ComponentModel.ISupportInitialize)this.T1).EndInit();
		((System.ComponentModel.ISupportInitialize)this.DownLoad).EndInit();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
