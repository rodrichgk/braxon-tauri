using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Windows.Forms;
using ElectronikSistem;
using SC_F2_EVO.Properties;

namespace SC_F2_EVO;

public class FormSensor : Form
{
	private const int DELAY = 50;

	private FormReport Terminal;

	private new PointF[] Location;

	private PictureBox[] Menometri;

	private Queue<string> Comand;

	private int ID_ABS;

	private double Alfa;

	private double QQQ;

	private double ScaleX;

	private double ScaleY;

	private bool[] ErrorCom = new bool[2];

	private bool StartForm = false;

	private bool WaitResponse = false;

	private bool StopRequest = false;

	private string StringaConnessione;

	private Font FontGauge;

	private Font FontVoltMater;

	private LinearGradientBrush GradientChannel;

	private int DisconnectCount = 0;

	private DataTable DataABS;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private Bitmap Lancetta;

	private Bitmap Sfondo;

	private IContainer components = null;

	private Label StartStop;

	private Label Nome;

	public Timer Send;

	private Label label4;

	private Label label3;

	private Label label2;

	private Label label1;

	private TextBox XVOLT2;

	private TextBox YBAR2;

	private TextBox XVOLT1;

	private TextBox YBAR1;

	private CheckBox Taratura;

	private Button btnTerminal;

	private Button Clear;

	private GroupBox GroupControl;

	private PictureBox Sensor;

	private PictureBox Pump;

	private Timer Active;

	private new Label Close;

	private Label label5;

	public FormSensor(int id)
	{
		InitializeComponent();
		ID_ABS = id;
		Menometri = new PictureBox[2] { Sensor, Pump };
		Lancetta = (Bitmap)Image.FromFile("Lencetta3.bmp");
		Lancetta.MakeTransparent(Color.White);
		Sfondo = Resources.SensorBackground;
		Comand = new Queue<string>();
		Location = new PointF[2]
		{
			new PointF(1487f, 2806f),
			new PointF(4077f, 2806f)
		};
		Rectangle rect = new Rectangle(300 * Sensor.Width / 400, 0, Sensor.Width * 2, 22);
		FontGauge = new Font(FontFamily.GenericMonospace, 30f, FontStyle.Bold);
		FontVoltMater = new Font(FontFamily.GenericSerif, 55f, FontStyle.Bold);
		GradientChannel = new LinearGradientBrush(rect, Color.Red, Color.Lime, LinearGradientMode.Horizontal);
		DataABS = new DataTable();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		GroupControl.Visible = MainMenuForm.User;
	}

	private void FormSensor_Load(object sender, EventArgs e)
	{
		Command.CommandText = "SELECT Nome FROM ABS WHERE ID = " + ID_ABS;
		Command.Connection.Open();
		Nome.Text = Command.ExecuteScalar().ToString();
		Command.Connection.Close();
		LoadDataABS();
	}

	private void FormSensor_Activated(object sender, EventArgs e)
	{
		if (!StartForm)
		{
			SetForm();
			Active.Enabled = true;
			StartForm = true;
		}
	}

	private void Active_Tick(object sender, EventArgs e)
	{
		Active.Enabled = false;
		if (MainMenuForm.TestHydraulic > -1)
		{
			ChangeStateReport(MainMenuForm.COM[MainMenuForm.TestHydraulic], enable: true);
		}
		Comand.Enqueue("H-ENABLESENSORTEST");
		Comand.Enqueue("H-ENABLESENSORTEST");
		base.Opacity = 100.0;
	}

	private void SensorBackground(PictureBox p, int n)
	{
		Bitmap bitmap = null;
		Graphics graphics = null;
		Sensor.Image = null;
		if (!Taratura.Checked)
		{
			p.Top = (int)((double)Location[n].Y * ScaleY) - p.Height / 2;
			p.Left = (int)((double)Location[n].X * ScaleX) - p.Width / 2;
			bitmap = new Bitmap(p.Width, p.Height);
			graphics = Graphics.FromImage(bitmap);
			graphics.DrawImage(Sfondo, new Rectangle(new Point(0, 0), p.Bounds.Size), new Rectangle((int)((double)p.Left / ScaleX), (int)((double)p.Top / ScaleY), (int)((double)p.Width / ScaleX), (int)((double)p.Height / ScaleY)), GraphicsUnit.Pixel);
			p.BackgroundImage = bitmap;
		}
		else
		{
			p.BackgroundImage = (Bitmap)Image.FromFile("VoltMeter.bmp");
		}
	}

	private void SetForm()
	{
		int num = 0;
		Bitmap bitmap = null;
		Graphics graphics = null;
		ScaleX = (double)base.Width / (double)Sfondo.Width;
		ScaleY = (double)base.Height / (double)Sfondo.Height;
		PictureBox[] menometri = Menometri;
		foreach (PictureBox pictureBox in menometri)
		{
			if (Sensor.Equals(pictureBox))
			{
				SensorBackground(pictureBox, num++);
				continue;
			}
			pictureBox.Top = (int)((double)Location[num].Y * ScaleY) - pictureBox.Height / 2;
			pictureBox.Left = (int)((double)Location[num].X * ScaleX) - pictureBox.Width / 2;
			num++;
			bitmap = new Bitmap(pictureBox.Width, pictureBox.Height);
			graphics = Graphics.FromImage(bitmap);
			graphics.DrawImage(Sfondo, new Rectangle(new Point(0, 0), pictureBox.Bounds.Size), new Rectangle((int)((double)pictureBox.Left / ScaleX), (int)((double)pictureBox.Top / ScaleY), (int)((double)pictureBox.Width / ScaleX), (int)((double)pictureBox.Height / ScaleY)), GraphicsUnit.Pixel);
			pictureBox.BackgroundImage = bitmap;
		}
		label5.Left = Sensor.Left + Sensor.Width / 2 - label5.Width / 2;
		label5.Top = Sensor.Top - label5.Height + 2;
		BackgroundImage = Sfondo;
	}

	private void LoadDataABS()
	{
		DataABS.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM SensorValues WHERE ID_ABS = " + ID_ABS;
		Adapter.Fill(DataABS);
		if (DataABS.Rows.Count == 1)
		{
			DataRow dataRow = DataABS.Rows[0];
			double num = (double)dataRow["YBAR1"];
			double num2 = (double)dataRow["YBAR2"];
			double num3 = (double)dataRow["XVOLT1"];
			double num4 = (double)dataRow["XVOLT2"];
			Alfa = (num2 - num) / (num4 - num3);
			QQQ = num - Alfa * num3;
			YBAR1.Text = num.ToString();
			YBAR2.Text = num2.ToString();
			XVOLT1.Text = num3.ToString();
			XVOLT2.Text = num4.ToString();
			StartStop.Enabled = true;
		}
		else
		{
			StartStop.Enabled = false;
		}
	}

	public void Handle_DataReceived(sbyte n)
	{
		char c = '\0';
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
				string text = MainMenuForm.DataUart[n];
				string text2 = text.Split(':')[0].Replace("\r\n", "");
				if (text2 != "Status")
				{
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
				case "Status":
					ErrorCom[MainMenuForm.TestHydraulic] = false;
					RefreshStatus(text);
					break;
				case "DISABLESTATUS":
					WaitResponse = true;
					break;
				case "ENABLESTATUS":
					WaitResponse = true;
					break;
				}
				if (text2 != "Status")
				{
					AddReport(MainMenuForm.DataUart[n]);
				}
				MainMenuForm.DataUart[n] = "";
			}
			catch (Exception)
			{
			}
			finally
			{
				Send.Start();
			}
		}
	}

	private void AddReport(string report)
	{
		if (Terminal != null)
		{
			Terminal.Report.Text += report;
			Terminal.Report.SelectionStart = Terminal.Report.TextLength;
			Terminal.Report.ScrollToCaret();
			Application.DoEvents();
		}
	}

	private void RefreshStatus(string response)
	{
		if (response.IndexOf("Status:") < 0)
		{
			return;
		}
		response = response.Replace("Status: ", "").Replace("\r", "").Replace("\r", "");
		string[] array = response.Replace("\r", "").Replace("\n", "").Split(";"[0]);
		if (array.Length >= 38)
		{
			int num = int.Parse(array[36].Split('-')[0]);
			bool flag = array[23] == "1";
			double num2 = double.Parse(array[0].Replace(".", ","), MainMenuForm.Culture);
			double num3 = 5.0 * (double)num / 1024.0;
			double num4 = Alfa * num3 + QQQ;
			if (!Taratura.Checked)
			{
				Sensor.Tag = num4;
				GaugeRefresh(Sensor);
			}
			else
			{
				Sensor.Tag = num3;
				VoltmeterRefresh(Sensor);
			}
			Pump.Tag = num2;
			GaugeRefresh(Pump);
		}
	}

	private void Send_Tick(object sender, EventArgs e)
	{
		try
		{
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
				MainMenuForm.COM[MainMenuForm.TestHydraulic].WriteLine(text);
			}
		}
		catch (IOException)
		{
			if (MainMenuForm.TestHydraulic > -1)
			{
				DisconnectCount++;
				ErrorCom[MainMenuForm.TestHydraulic] = true;
			}
		}
		catch (InvalidOperationException)
		{
			if (MainMenuForm.TestHydraulic > -1)
			{
				DisconnectCount++;
				ErrorCom[MainMenuForm.TestHydraulic] = true;
			}
		}
		catch (UnauthorizedAccessException)
		{
			if (MainMenuForm.TestHydraulic > -1)
			{
				DisconnectCount++;
				ErrorCom[MainMenuForm.TestHydraulic] = true;
			}
		}
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
					MainMenuForm.COM[MainMenuForm.TestHydraulic].WriteLine("ENABLESTATUS");
				}
				else
				{
					if (!Comand.Contains("H-DISABLESENSORTEST"))
					{
						Comand.Enqueue("H-DISABLESENSORTEST");
					}
					if (!Comand.Contains("DISABLESTATUS"))
					{
						Comand.Enqueue("DISABLESTATUS");
					}
				}
			}
			Sistem.Delay(300.0);
		}
		while (!WaitResponse && DateTime.Now.Subtract(now).TotalMilliseconds < timeout);
	}

	private bool ValidateField()
	{
		if (!double.TryParse(YBAR1.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
		{
			MessageBox.Show("Valore YBAR2 non corretto!!!", "", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return false;
		}
		if (!double.TryParse(YBAR2.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
		{
			MessageBox.Show("Valore YBAR1 non corretto!!!", "", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return false;
		}
		if (!double.TryParse(XVOLT1.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
		{
			MessageBox.Show("Valore XVOLT2 non corretto!!!", "", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return false;
		}
		if (!double.TryParse(XVOLT2.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
		{
			MessageBox.Show("Valore XVOLT1 non corretto!!!", "", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return false;
		}
		return true;
	}

	private void Salva()
	{
		string text = "";
		if (ValidateField())
		{
			Command.Connection.Open();
			if (DataABS.Rows.Count == 1)
			{
				text += "UPDATE [SensorValues] SET ";
				text = text + "[YBAR1] = " + YBAR1.Text.Replace(",", ".") + ", ";
				text = text + "[YBAR2] = " + YBAR2.Text.Replace(",", ".") + ", ";
				text = text + "[XVOLT1] = " + XVOLT1.Text.Replace(",", ".") + ", ";
				text = text + "[XVOLT2] = " + XVOLT2.Text.Replace(",", ".");
				text = text + " WHERE [ID_ABS] = " + ID_ABS;
			}
			else
			{
				text = "INSERT INTO SensorValues ([ID_ABS], [YBAR1], [YBAR2], [XVOLT1], [XVOLT2]) VALUES (";
				text = text + ID_ABS + ",";
				text = text + YBAR1.Text.Replace(",", ".") + ",";
				text = text + YBAR2.Text.Replace(",", ".") + ",";
				text = text + XVOLT1.Text.Replace(",", ".") + ",";
				text += XVOLT2.Text.Replace(",", ".");
				text += ")";
			}
			if (!ExecuteQuery(text, out var message))
			{
				throw new Exception(message);
			}
			Command.Connection.Close();
			LoadDataABS();
		}
	}

	private bool ExecuteQuery(string query, out string message)
	{
		OleDbTransaction oleDbTransaction = null;
		try
		{
			oleDbTransaction = Command.Connection.BeginTransaction();
			Command.Transaction = oleDbTransaction;
			Command.CommandText = query;
			Command.ExecuteNonQuery();
			oleDbTransaction.Commit();
			message = "";
			return true;
		}
		catch (Exception ex)
		{
			oleDbTransaction.Rollback();
			message = ex.Message;
			return false;
		}
	}

	private void Chiudi_Click(object sender, EventArgs e)
	{
		Close();
	}

	private void Pompa(string state)
	{
		string item = "Pompa:" + state;
		Comand.Enqueue(item);
	}

	private void StartStop_Click(object sender, EventArgs e)
	{
		if (StartStop.Text == "Start")
		{
			StartStop.ForeColor = Color.Red;
			StartStop.Text = "Stop";
		}
		else
		{
			StartStop.ForeColor = Color.Lime;
			StartStop.Text = "Start";
			Pompa("OFF");
			Comand.Enqueue("H-EMPTYCHANNEL");
			StopRequest = true;
		}
		YBAR1.BackColor = Color.White;
		XVOLT1.BackColor = Color.White;
		YBAR2.BackColor = Color.White;
		XVOLT2.BackColor = Color.White;
	}

	private void Modifica_CheckedChanged(object sender, EventArgs e)
	{
		StartStop.Enabled = !Taratura.Checked;
		YBAR1.BackColor = Color.White;
		XVOLT1.BackColor = Color.White;
		YBAR2.BackColor = Color.White;
		XVOLT2.BackColor = Color.White;
		SensorBackground(Sensor, 0);
		label5.Visible = Taratura.Checked;
		if (!Taratura.Checked)
		{
			StopRequest = true;
			Pompa("OFF");
			Comand.Enqueue("H-EMPTYCHANNEL");
			StopRequest = true;
		}
	}

	private void Close_Click(object sender, EventArgs e)
	{
		Send.Stop();
		Close();
		Dispose();
	}

	private void StepMotor(bool incdec)
	{
		string text = "Step:800;";
		if (Comand.Count <= 0)
		{
			sbyte b = 1;
			if (incdec)
			{
				b = -1;
			}
			text += b;
			Comand.Enqueue(text);
		}
	}

	private void Clear_Click(object sender, EventArgs e)
	{
		if (Terminal == null)
		{
			Terminal.Report.Text = "";
		}
	}

	private void FormSensor_FormClosing(object sender, FormClosingEventArgs e)
	{
		if (Terminal != null)
		{
			Terminal.Close();
			Terminal.Dispose();
			Terminal = null;
		}
		if (MainMenuForm.TestHydraulic > -1)
		{
			ChangeStateReport(MainMenuForm.COM[MainMenuForm.TestHydraulic], enable: false);
		}
		Send.Stop();
	}

	private void btnTerminal_Click(object sender, EventArgs e)
	{
		if (Terminal == null)
		{
			Terminal = new FormReport(enableprinter: false);
			Terminal.TopMost = true;
			Terminal.FormClosed += Terminal_FormClosed;
			Terminal.Show();
			Terminal.Left = 200;
		}
	}

	private void Terminal_FormClosed(object sender, FormClosedEventArgs e)
	{
		Terminal.Dispose();
		Terminal = null;
	}

	private void VoltmeterRefresh(PictureBox voltmeter)
	{
		Bitmap image = new Bitmap(voltmeter.Bounds.Width, voltmeter.Bounds.Height);
		Graphics graphics = Graphics.FromImage(image);
		string s = ((double)voltmeter.Tag).ToString("###0.00").Replace(",", ".") + "V";
		SizeF sizeF = graphics.MeasureString(s, FontVoltMater);
		graphics.DrawString(s, FontVoltMater, Brushes.Black, ((float)voltmeter.Width - sizeF.Width) / 2f, ((float)voltmeter.Height - sizeF.Height) / 2f - 10f);
		voltmeter.Image = image;
	}

	private void GaugeRefresh(PictureBox gauge)
	{
		Bitmap image = new Bitmap(gauge.Bounds.Width, gauge.Bounds.Height);
		Graphics graphics = Graphics.FromImage(image);
		float num = 150f;
		float num2 = 124f;
		float offsetX = -7f;
		float offsetY = 4f;
		Matrix matrix = new Matrix();
		matrix.RotateAt(18f + 234f * (float)(double)gauge.Tag / 400f, new PointF(num, num2));
		matrix.Translate(offsetX, offsetY, MatrixOrder.Append);
		graphics.Transform = matrix;
		graphics.DrawImage(Lancetta, 0, 0);
		LinearGradientBrush gradientChannel = GradientChannel;
		matrix = new Matrix();
		graphics.Transform = matrix;
		graphics.FillRectangle(gradientChannel, 0f, gauge.Height - 22, (float)(double)gauge.Tag * (float)gauge.Width / 400f, gauge.Height);
		string s = ((int)(double)gauge.Tag).ToString().PadLeft(3, ' ');
		SizeF sizeF = graphics.MeasureString(s, FontGauge);
		graphics.DrawString(s, FontGauge, Brushes.White, ((float)gauge.Width - sizeF.Width) / 2f + 4f, (float)gauge.Height - sizeF.Height - 20f);
		gauge.Image = image;
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
		this.StartStop = new System.Windows.Forms.Label();
		this.Nome = new System.Windows.Forms.Label();
		this.Send = new System.Windows.Forms.Timer(this.components);
		this.label4 = new System.Windows.Forms.Label();
		this.label3 = new System.Windows.Forms.Label();
		this.label2 = new System.Windows.Forms.Label();
		this.label1 = new System.Windows.Forms.Label();
		this.XVOLT2 = new System.Windows.Forms.TextBox();
		this.YBAR2 = new System.Windows.Forms.TextBox();
		this.XVOLT1 = new System.Windows.Forms.TextBox();
		this.YBAR1 = new System.Windows.Forms.TextBox();
		this.Taratura = new System.Windows.Forms.CheckBox();
		this.btnTerminal = new System.Windows.Forms.Button();
		this.Clear = new System.Windows.Forms.Button();
		this.GroupControl = new System.Windows.Forms.GroupBox();
		this.Close = new System.Windows.Forms.Label();
		this.Sensor = new System.Windows.Forms.PictureBox();
		this.Pump = new System.Windows.Forms.PictureBox();
		this.Active = new System.Windows.Forms.Timer(this.components);
		this.label5 = new System.Windows.Forms.Label();
		this.GroupControl.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Sensor).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.Pump).BeginInit();
		base.SuspendLayout();
		this.StartStop.AutoSize = true;
		this.StartStop.BackColor = System.Drawing.Color.Transparent;
		this.StartStop.Cursor = System.Windows.Forms.Cursors.Hand;
		this.StartStop.Font = new System.Drawing.Font("Microsoft Sans Serif", 27.75f, System.Drawing.FontStyle.Bold);
		this.StartStop.ForeColor = System.Drawing.Color.Lime;
		this.StartStop.Location = new System.Drawing.Point(489, 55);
		this.StartStop.Name = "StartStop";
		this.StartStop.Size = new System.Drawing.Size(101, 42);
		this.StartStop.TabIndex = 0;
		this.StartStop.Text = "Start";
		this.StartStop.Click += new System.EventHandler(StartStop_Click);
		this.Nome.BackColor = System.Drawing.Color.Transparent;
		this.Nome.Font = new System.Drawing.Font("Microsoft Sans Serif", 21.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Nome.ForeColor = System.Drawing.Color.White;
		this.Nome.Location = new System.Drawing.Point(0, 574);
		this.Nome.Name = "Nome";
		this.Nome.Size = new System.Drawing.Size(360, 36);
		this.Nome.TabIndex = 5;
		this.Nome.TextAlign = System.Drawing.ContentAlignment.BottomCenter;
		this.Send.Enabled = true;
		this.Send.Interval = 200;
		this.Send.Tick += new System.EventHandler(Send_Tick);
		this.label4.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(139, 83);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(67, 16);
		this.label4.TabIndex = 415;
		this.label4.Text = "XVOLT2:";
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(11, 83);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(67, 16);
		this.label3.TabIndex = 414;
		this.label3.Text = "XVOLT1:";
		this.label2.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(146, 49);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(60, 16);
		this.label2.TabIndex = 413;
		this.label2.Text = "YBAR2:";
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(18, 49);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(60, 16);
		this.label1.TabIndex = 412;
		this.label1.Text = "YBAR1:";
		this.XVOLT2.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.XVOLT2.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.XVOLT2.Location = new System.Drawing.Point(212, 82);
		this.XVOLT2.Name = "XVOLT2";
		this.XVOLT2.ReadOnly = true;
		this.XVOLT2.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.XVOLT2.Size = new System.Drawing.Size(42, 20);
		this.XVOLT2.TabIndex = 4;
		this.XVOLT2.Text = "1.16";
		this.YBAR2.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.YBAR2.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.YBAR2.Location = new System.Drawing.Point(212, 46);
		this.YBAR2.Name = "YBAR2";
		this.YBAR2.ReadOnly = true;
		this.YBAR2.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.YBAR2.Size = new System.Drawing.Size(42, 20);
		this.YBAR2.TabIndex = 2;
		this.YBAR2.Text = "90";
		this.XVOLT1.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.XVOLT1.Location = new System.Drawing.Point(84, 82);
		this.XVOLT1.Name = "XVOLT1";
		this.XVOLT1.ReadOnly = true;
		this.XVOLT1.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.XVOLT1.Size = new System.Drawing.Size(42, 20);
		this.XVOLT1.TabIndex = 3;
		this.XVOLT1.Text = "0.7";
		this.YBAR1.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.YBAR1.Location = new System.Drawing.Point(84, 48);
		this.YBAR1.Name = "YBAR1";
		this.YBAR1.ReadOnly = true;
		this.YBAR1.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.YBAR1.Size = new System.Drawing.Size(42, 20);
		this.YBAR1.TabIndex = 1;
		this.YBAR1.Text = "40";
		this.Taratura.AutoSize = true;
		this.Taratura.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Taratura.Location = new System.Drawing.Point(13, 12);
		this.Taratura.Name = "Taratura";
		this.Taratura.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.Taratura.Size = new System.Drawing.Size(96, 24);
		this.Taratura.TabIndex = 422;
		this.Taratura.Text = "Taratura";
		this.Taratura.UseVisualStyleBackColor = true;
		this.Taratura.CheckedChanged += new System.EventHandler(Modifica_CheckedChanged);
		this.btnTerminal.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.btnTerminal.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnTerminal.Location = new System.Drawing.Point(274, 37);
		this.btnTerminal.Name = "btnTerminal";
		this.btnTerminal.Size = new System.Drawing.Size(124, 35);
		this.btnTerminal.TabIndex = 424;
		this.btnTerminal.Text = "Terminal";
		this.btnTerminal.UseVisualStyleBackColor = true;
		this.btnTerminal.Click += new System.EventHandler(btnTerminal_Click);
		this.Clear.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Clear.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Clear.Location = new System.Drawing.Point(274, 73);
		this.Clear.Name = "Clear";
		this.Clear.Size = new System.Drawing.Size(123, 35);
		this.Clear.TabIndex = 425;
		this.Clear.Text = "Clear Report";
		this.Clear.UseVisualStyleBackColor = true;
		this.Clear.Click += new System.EventHandler(Clear_Click);
		this.GroupControl.Controls.Add(this.btnTerminal);
		this.GroupControl.Controls.Add(this.Clear);
		this.GroupControl.Controls.Add(this.Taratura);
		this.GroupControl.Controls.Add(this.XVOLT2);
		this.GroupControl.Controls.Add(this.YBAR2);
		this.GroupControl.Controls.Add(this.label3);
		this.GroupControl.Controls.Add(this.label4);
		this.GroupControl.Controls.Add(this.label1);
		this.GroupControl.Controls.Add(this.XVOLT1);
		this.GroupControl.Controls.Add(this.label2);
		this.GroupControl.Controls.Add(this.YBAR1);
		this.GroupControl.Location = new System.Drawing.Point(234, 458);
		this.GroupControl.Name = "GroupControl";
		this.GroupControl.Size = new System.Drawing.Size(402, 116);
		this.GroupControl.TabIndex = 426;
		this.GroupControl.TabStop = false;
		this.Close.AutoSize = true;
		this.Close.BackColor = System.Drawing.Color.Transparent;
		this.Close.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Close.Font = new System.Drawing.Font("Microsoft Sans Serif", 27.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Close.ForeColor = System.Drawing.SystemColors.ControlLightLight;
		this.Close.Location = new System.Drawing.Point(489, 574);
		this.Close.Name = "Close";
		this.Close.Size = new System.Drawing.Size(119, 42);
		this.Close.TabIndex = 427;
		this.Close.Text = "Close";
		this.Close.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Close.Click += new System.EventHandler(Close_Click);
		this.Sensor.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Sensor.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Sensor.Location = new System.Drawing.Point(37, 199);
		this.Sensor.Name = "Sensor";
		this.Sensor.Size = new System.Drawing.Size(286, 253);
		this.Sensor.TabIndex = 428;
		this.Sensor.TabStop = false;
		this.Pump.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Pump.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Stretch;
		this.Pump.Location = new System.Drawing.Point(339, 199);
		this.Pump.Name = "Pump";
		this.Pump.Size = new System.Drawing.Size(286, 253);
		this.Pump.TabIndex = 429;
		this.Pump.TabStop = false;
		this.Active.Tick += new System.EventHandler(Active_Tick);
		this.label5.BackColor = System.Drawing.Color.Black;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 21.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.ForeColor = System.Drawing.Color.White;
		this.label5.Location = new System.Drawing.Point(119, 166);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(125, 30);
		this.label5.TabIndex = 430;
		this.label5.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label5.Visible = false;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		this.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Zoom;
		base.ClientSize = new System.Drawing.Size(637, 619);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.Pump);
		base.Controls.Add(this.Sensor);
		base.Controls.Add(this.Close);
		base.Controls.Add(this.GroupControl);
		base.Controls.Add(this.StartStop);
		base.Controls.Add(this.Nome);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormSensor";
		base.Opacity = 0.0;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Sensor Pressure";
		base.Activated += new System.EventHandler(FormSensor_Activated);
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(FormSensor_FormClosing);
		base.Load += new System.EventHandler(FormSensor_Load);
		this.GroupControl.ResumeLayout(false);
		this.GroupControl.PerformLayout();
		((System.ComponentModel.ISupportInitialize)this.Sensor).EndInit();
		((System.ComponentModel.ISupportInitialize)this.Pump).EndInit();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
