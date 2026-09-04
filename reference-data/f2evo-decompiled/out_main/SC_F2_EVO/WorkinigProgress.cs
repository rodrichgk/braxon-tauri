using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Globalization;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ElectronikSistem;

namespace SC_F2_EVO;

public class WorkinigProgress : Form
{
	private Queue<COMMAND> BufferTx;

	private Queue<char> BufferRx;

	private bool IsElectronicConnected = false;

	private bool WaitResponse = false;

	private bool ErrorCanBUS = false;

	private Button LastButton;

	private byte ErrorConnection = 0;

	private byte BaseString;

	private int IDModel = -1;

	private int Count = 0;

	private double Frequency;

	private double Coefficient = 0.16;

	private double DeltaSpeed = 1.0;

	private ModelComponent Car;

	private Queue<FRAME> MotorDataCAN;

	private Queue<FRAME> BaseDataCAN;

	private Queue<FRAME> GearDataCAN;

	private Queue<string> Strings = new Queue<string>();

	private List<double> TimerMeasure = new List<double>();

	private CheckBox[] Wheel;

	private string Comando;

	private string P1;

	private string P2;

	private string P3;

	private string P4;

	private Queue<byte> UARTText = new Queue<byte>();

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private DataTable TableBase;

	private DataTable TableMotor;

	private DataTable TableGear;

	private Progress ProgressBar;

	private DateTime TimeElapsed;

	private DateTime TimerCycle;

	private IContainer components = null;

	private GroupBox Sensor;

	private RadioButton Sinusoidale;

	private RadioButton Quadra12;

	private RadioButton Quadra5;

	private RadioButton Disablilita;

	private TrackBar Frequenza;

	private Label label1;

	private TextBox Report;

	private Timer Polling;

	private RadioButton Active;

	private RadioButton Passive;

	private GroupBox SignalOUT;

	private CheckBox Rele;

	private CheckBox Freno;

	private GroupBox SignalIN;

	private Button Current;

	private Button Volt;

	private CheckBox ReleExt;

	private CheckBox Routa2;

	private CheckBox Ruota1;

	private CheckBox Routa4;

	private CheckBox Ruota3;

	private Timer SpeedTimer;

	private CheckBox SpeedTest;

	private CheckBox SetSpeed;

	private TextBox Speed;

	private Timer ReportTimer;

	private Label label2;

	private Button SelezionaModello;

	private Button Stop;

	private Label label3;

	private Button Motor;

	private Button Valve;

	private Label Comunication;

	private ComboBox cmbComponent;

	private GroupBox StartCAN;

	private Button CheckCode;

	private Button MotorOff;

	private Button TestGEARBOX;

	private OpenFileDialog ImportFile;

	private GroupBox Wheel1;

	private TextBox Wheel1Res1;

	private Label label6;

	private TextBox Wheel1Res2;

	private Label label7;

	private GroupBox Wheel4;

	private TextBox Wheel4Res1;

	private Label label14;

	private TextBox Wheel4Res2;

	private Label label15;

	private GroupBox Wheel3;

	private TextBox Wheel3Res1;

	private Label label12;

	private TextBox Wheel3Res2;

	private Label label13;

	private GroupBox Wheel2;

	private TextBox Wheel2Res1;

	private Label label10;

	private TextBox Wheel2Res2;

	private Label label11;

	private CheckBox SetDelta;

	private TextBox Rear;

	private TextBox Front;

	private CheckBox Copia;

	private Button btnDown;

	private Button btnUP;

	private Button btnD;

	private Button btnS;

	private Button btnN;

	private Button btnR;

	private Button Parking;

	private Label StopGearLevel;

	private Button Clear;

	private Button Engine;

	private Button DisableSpeed;

	private Button TestCLUTCH;

	private Button GetDataMemory;

	private GroupBox Gear;

	private Button ResetMemory;

	private Label Stato;

	private TextBox Alfa4;

	private Label label23;

	private TextBox Alfa3;

	private Label label24;

	private TextBox Alfa2;

	private Label label25;

	private TextBox Alfa1;

	private Label label26;

	public WorkinigProgress()
	{
		InitializeComponent();
		BufferTx = new Queue<COMMAND>();
		BufferRx = new Queue<char>();
		if (MainMenuForm.User)
		{
			base.FormBorderStyle = FormBorderStyle.Fixed3D;
		}
	}

	private void WorkinigProgress_Load(object sender, EventArgs e)
	{
		Sensor.Enabled = MainMenuForm.Uscite;
		SignalOUT.Enabled = MainMenuForm.Uscite;
		SignalIN.Enabled = MainMenuForm.Uscite;
		Frequenza.Value = 0;
		Wheel = new CheckBox[4] { Ruota1, Routa2, Ruota3, Routa4 };
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		adapter = new OleDbDataAdapter(Command);
		TableBase = new DataTable();
		TableMotor = new DataTable();
		TableGear = new DataTable();
		BaseDataCAN = new Queue<FRAME>();
		MotorDataCAN = new Queue<FRAME>();
		GearDataCAN = new Queue<FRAME>();
		cmbComponent.SelectedIndex = 0;
	}

	private void InviaComando(sbyte com, string cmd)
	{
		if (com != -1)
		{
			if (!MainMenuForm.COM[com].IsOpen)
			{
				MainMenuForm.COM[com].Open();
			}
			BufferTx.Enqueue(new COMMAND(com, "\u0002" + cmd));
		}
	}

	public void Handle_DataReceived(sbyte n)
	{
		char c = '\0';
		while (MainMenuForm.BufferRx[n].Count > 0)
		{
			c = MainMenuForm.BufferRx[n].Dequeue();
			BufferRx.Enqueue(c);
			if (c != '\r' && c != '\n')
			{
				MainMenuForm.DataUart[n] += c;
			}
			else if (c == '\n')
			{
				while (BufferRx.Count > 0)
				{
					if (BufferRx.Peek() == '@')
					{
						do
						{
							BufferRx.Dequeue();
						}
						while (BufferRx.Count > 0 && BufferRx.Dequeue() != '\n');
					}
					else
					{
						ReportTimer.Stop();
						UARTText.Enqueue((byte)BufferRx.Dequeue());
					}
					c = '\0';
				}
			}
			else if (c == '\r')
			{
				if (MainMenuForm.DataUart[n].Split(':').Length >= 2)
				{
					MainMenuForm.Value[n] = MainMenuForm.DataUart[n].Split(':')[1];
				}
				MainMenuForm.DataUart[n] = MainMenuForm.DataUart[n].Split(':')[0];
				switch (MainMenuForm.DataUart[n])
				{
				case "@":
				{
					double totalMilliseconds = DateTime.Now.Subtract(TimerCycle).TotalMilliseconds;
					TimerCycle = DateTime.Now;
					totalMilliseconds = Math.Round(totalMilliseconds, 0);
					Stato.Text = "Time Cycle: " + MainMenuForm.Value[n];
					break;
				}
				case "Block":
					Polling.Stop();
					Polling.Start();
					break;
				case "OK":
				case "BreakSpeed":
					Polling.Stop();
					if (BufferTx.Count > 0)
					{
						BufferTx.Dequeue();
						double totalMilliseconds = DateTime.Now.Subtract(TimeElapsed).TotalMilliseconds;
						TimeElapsed = DateTime.Now;
						totalMilliseconds = Math.Round(totalMilliseconds, 0);
						if (ProgressBar != null)
						{
							ProgressBar.Text = "Time Elapsed: " + totalMilliseconds + " : " + Count;
						}
					}
					Polling_Tick(null, null);
					ResetMemory.Enabled = true;
					Polling.Start();
					break;
				case "Volt":
				{
					if (double.TryParse(MainMenuForm.Value[n], NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result2))
					{
						result2 *= 0.0146484375;
						Volt.Text = result2.ToString("##0.0 V");
					}
					break;
				}
				case "Current":
				{
					if (double.TryParse(MainMenuForm.Value[n], NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
					{
						result *= 0.06103515625;
						Current.Text = result.ToString("##0.00 A");
					}
					break;
				}
				case "Comunication":
					Comunication.Text = "Comunication: " + MainMenuForm.Value[n];
					break;
				case "Frequency":
					if (Car.Type == 0)
					{
						if (double.TryParse(MainMenuForm.Value[n].Replace(".", ",").Replace(":", ""), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Frequency))
						{
							label1.Text = (Frequency * Coefficient).ToString("##0.0 K/h");
						}
					}
					else if (double.TryParse(MainMenuForm.Value[n].Replace(".", ",").Replace(":", ""), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out Frequency))
					{
						label1.Text = Frequency.ToString("###0 Hz");
					}
					if (Frequency == 0.0)
					{
						Frequency *= 1.0;
					}
					break;
				case "Pressures":
					if (MainMenuForm.Value[n].Split(";"[0]).Length >= 4)
					{
						P1 = MainMenuForm.Value[n].Split(";"[0])[0];
						P2 = MainMenuForm.Value[n].Split(";"[0])[1];
						P3 = MainMenuForm.Value[n].Split(";"[0])[2];
						P4 = MainMenuForm.Value[n].Split(";"[0])[3];
						Text = P1 + ";" + P2 + ";" + P3 + ";" + P4 + ";" + MainMenuForm.Value[n].Split(";"[0])[4];
					}
					break;
				case "Information":
					ErrorConnection = 0;
					IsElectronicConnected = true;
					WaitResponse = true;
					break;
				case "End test gauge":
					MessageBox.Show(MainMenuForm.DataUart[n] + ": " + MainMenuForm.Value[n], "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
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
					Gear.Enabled = true;
					GetDataMemory.Enabled = true;
					break;
				case "Write":
					Gear.Enabled = true;
					GetDataMemory.Enabled = true;
					break;
				case "Error":
					if (!ErrorCanBUS)
					{
						MessageBox.Show(MainMenuForm.DataUart[n] + ": " + MainMenuForm.Value[n], "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					}
					if (!ErrorCanBUS && MainMenuForm.Value[n] == " CAN BUS!!!")
					{
						ErrorCanBUS = true;
					}
					break;
				}
				MainMenuForm.DataUart[n] = "";
				MainMenuForm.Value[n] = "";
			}
			if (UARTText.Count > 0)
			{
				ReportTimer.Start();
			}
		}
	}

	private void ReportTimer_Tick(object sender, EventArgs e)
	{
		ReportTimer.Stop();
		if (UARTText.Count != 0)
		{
			string text = Encoding.UTF8.GetString(UARTText.ToArray());
			Report.Text += text;
			Report.SelectionStart = Report.TextLength;
			Report.ScrollToCaret();
			UARTText.Clear();
		}
	}

	private void Polling_Tick(object sender, EventArgs e)
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
				ReleaseElectronic();
			}
			else if (ErrorConnection > 7)
			{
				ReleaseElectronic();
			}
		}
		if (BufferTx.Count <= 0)
		{
			return;
		}
		COMMAND cOMMAND = BufferTx.Peek();
		if (cOMMAND.COM <= -1)
		{
			return;
		}
		MainMenuForm.COM[cOMMAND.COM].WriteLine(cOMMAND.CMD);
		TextBox report = Report;
		report.Text = report.Text + ((sender != null) ? sender.GetType().ToString() : "null") + "\r\n";
		if (ProgressBar != null)
		{
			if (sender != null)
			{
				Count++;
			}
			ProgressBar.Status.Value++;
			if (ProgressBar.Status.Value == ProgressBar.Status.Maximum)
			{
				ProgressBar.Close();
				ProgressBar.Dispose();
				ProgressBar = null;
			}
		}
		Comando = cOMMAND.CMD;
	}

	private void Select_CheckedChanged(object sender, EventArgs e)
	{
		RadioButton radioButton = (RadioButton)sender;
		if (!SpeedTest.Checked)
		{
			Frequenza.Value = 0;
			label1.Text = "0 K/h";
		}
		string text = "Select OUT:";
		if (radioButton.Checked)
		{
			Report.Text = "";
			text += radioButton.Tag;
			InviaComando(MainMenuForm.TestElectronic, text);
		}
	}

	private void Frequeza_Scroll(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Frequency:" + Frequenza.Value + "Hz");
	}

	private void Stop_Click(object sender, EventArgs e)
	{
		Report.Text = "";
		InviaComando(MainMenuForm.TestElectronic, "Stop Test");
	}

	private bool StartGEAR()
	{
		Command.Connection.Open();
		Command.CommandText = "SELECT Count(*) AS N FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND (Test = 3 OR Test = " + BaseString + ")";
		int num = (int)Command.ExecuteScalar();
		Command.Connection.Close();
		if (num > 0)
		{
			Parking_Click(Parking, new EventArgs());
		}
		if (BaseString > 0)
		{
			InviaComando(MainMenuForm.TestElectronic, "Enable Speed");
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Disable Speed");
		}
		if (BufferTx.Count > 0)
		{
			ProgressBar = new Progress();
			ProgressBar.Status.Maximum = BufferTx.Count;
			ProgressBar.ShowDialog();
		}
		return num > 0;
	}

	private void StartABS()
	{
		TableBase.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 3 ORDER BY [Order]";
		adapter.Fill(TableBase);
		if (TableBase.Rows.Count <= 0)
		{
			return;
		}
		Sistem.Delay(1000.0);
		BaseDataCAN.Clear();
		foreach (DataRow row in TableBase.Rows)
		{
			FRAME fRAME = new FRAME();
			fRAME.address1 = row["Address1"].ToString();
			fRAME.indx = short.Parse(row["Order"].ToString());
			fRAME.data = new List<byte>();
			fRAME.us = short.Parse(row["Delay"].ToString());
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
		List<FRAME> list = new List<FRAME>();
		while (BaseDataCAN.Count > 0)
		{
			FRAME fRAME = BaseDataCAN.Dequeue();
			if (BaseDataCAN.Count == 0 && MainMenuForm.N_STRING > 1)
			{
				fRAME.pos *= -1;
			}
			list.Add(fRAME);
			if (list.Count == MainMenuForm.N_STRING)
			{
				string cmd = ((MainMenuForm.N_STRING > 1) ? javaScriptSerializer.Serialize(list.ToArray()) : javaScriptSerializer.Serialize(list[0]));
				InviaComando(MainMenuForm.TestElectronic, cmd);
				list.Clear();
			}
		}
		if (list.Count > 0)
		{
			string cmd = javaScriptSerializer.Serialize(list.ToArray());
			InviaComando(MainMenuForm.TestElectronic, cmd);
			list.Clear();
		}
		InviaComando(MainMenuForm.TestElectronic, "Start ABS");
		if (BufferTx.Count > 0)
		{
			ProgressBar = new Progress();
			ProgressBar.Status.Maximum = BufferTx.Count;
			ProgressBar.ShowDialog();
		}
		Sistem.Delay(2000.0);
	}

	private void FillTable()
	{
		JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
		FRAME fRAME = new FRAME();
		TableMotor.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 1 ORDER BY [Order]";
		adapter.Fill(TableMotor);
		MotorDataCAN.Clear();
		foreach (DataRow row in TableMotor.Rows)
		{
			fRAME = new FRAME();
			fRAME.address1 = row["Address1"].ToString();
			fRAME.indx = (short)(int.Parse(row["Order"].ToString()) + BaseDataCAN.Count);
			fRAME.us = short.Parse(row["Delay"].ToString());
			fRAME.data = new List<byte>();
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
			fRAME.us = short.Parse(row2["Delay"].ToString());
			fRAME.data = new List<byte>();
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
		List<FRAME> list2 = new List<FRAME>();
		if (list.Count > 0)
		{
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

	private void SelezionaModello_Click(object sender, EventArgs e)
	{
		Cursor = Cursors.WaitCursor;
		Application.DoEvents();
		SelectModelForm selectModelForm = new SelectModelForm((byte)cmbComponent.SelectedIndex);
		if (selectModelForm.ShowDialog() == DialogResult.OK)
		{
			Report.Text = "";
			InviaComando(MainMenuForm.TestElectronic, "Stop Test");
			InviaComando(MainMenuForm.TestElectronic, "Frequency:0Hz");
			InviaComando(MainMenuForm.TestElectronic, "Select OUT:0");
			InviaComando(MainMenuForm.TestElectronic, "Passive");
			Car = null;
			Car = new ModelComponent();
			Car.Name = MainMenuForm.NomeModello;
			Motor.Enabled = true;
			Valve.Enabled = true;
			SpeedTest.Enabled = true;
			MotorOff.Enabled = true;
			SignalOUT.Enabled = true;
			label3.Text = "Model: " + MainMenuForm.NomeModello;
			DataTable dataTable = new DataTable();
			Command.CommandText = "SELECT * FROM Modelli WHERE ID = " + MainMenuForm.ID_Modello;
			adapter.Fill(dataTable);
			Car.Speed = sbyte.Parse(dataTable.Rows[0]["SpeedCAN"].ToString());
			Car.Type = Convert.ToByte(bool.Parse(dataTable.Rows[0]["Type"].ToString()));
			Car.Signal = byte.Parse(dataTable.Rows[0]["Signal"].ToString());
			Car.Spike = bool.Parse(dataTable.Rows[0]["Spike"].ToString());
			Car.Component = (byte)cmbComponent.SelectedIndex;
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
			if (!short.TryParse(dataTable.Rows[0]["Speed1"].ToString(), out Car.Speed1))
			{
				Car.Speed1 = 0;
			}
			if (!short.TryParse(dataTable.Rows[0]["Speed2"].ToString(), out Car.Speed2))
			{
				Car.Speed2 = 0;
			}
			if (!short.TryParse(dataTable.Rows[0]["Speed3"].ToString(), out Car.Speed3))
			{
				Car.Speed3 = 0;
			}
			if (!short.TryParse(dataTable.Rows[0]["Speed4"].ToString(), out Car.Speed4))
			{
				Car.Speed4 = 0;
			}
			Car.Alfa1 = (double)dataTable.Rows[0]["Alfa1"];
			Car.Alfa2 = (double)dataTable.Rows[0]["Alfa2"];
			Car.Alfa3 = (double)dataTable.Rows[0]["Alfa3"];
			Car.Alfa4 = (double)dataTable.Rows[0]["Alfa4"];
			Alfa1.Text = Car.Alfa1.ToString();
			Alfa2.Text = Car.Alfa2.ToString();
			Alfa3.Text = Car.Alfa3.ToString();
			Alfa4.Text = Car.Alfa4.ToString();
			if (double.TryParse(dataTable.Rows[0]["DeltaSpeed"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
			{
				Car.DeltaSpeed = result;
			}
			if (double.TryParse(dataTable.Rows[0]["Coefficient"].ToString(), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result))
			{
				Coefficient = result;
			}
			Car.Signal++;
			Wheel1Res1.Text = Car.Wheel1Res1.ToString();
			Wheel1Res2.Text = Car.Wheel1Res2.ToString();
			Wheel2Res1.Text = Car.Wheel2Res1.ToString();
			Wheel2Res2.Text = Car.Wheel2Res2.ToString();
			Wheel3Res1.Text = Car.Wheel3Res1.ToString();
			Wheel3Res2.Text = Car.Wheel3Res2.ToString();
			Wheel4Res1.Text = Car.Wheel4Res1.ToString();
			Wheel4Res2.Text = Car.Wheel4Res2.ToString();
			Car.Speed1 = (short)((double)Car.Speed1 / Coefficient);
			Car.Speed2 = (short)((double)Car.Speed2 / Coefficient);
			Car.Speed3 = (short)((double)Car.Speed3 / Coefficient);
			Car.Speed4 = (short)((double)Car.Speed4 / Coefficient);
			IDModel = (int)dataTable.Rows[0]["ID"];
			JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
			string text = javaScriptSerializer.Serialize(Car).Replace("Name", "Model");
			if (text.Length >= 512)
			{
				MessageBox.Show("Data too long!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
				return;
			}
			InviaComando(MainMenuForm.TestElectronic, text);
			Frequenza.Value = 0;
			Speed.Text = "";
		}
		Cursor = Cursors.Default;
	}

	private void DisableSpeed_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Disable Speed");
	}

	private void Engine_Click(object sender, EventArgs e)
	{
		BaseString = 10;
		StartGEAR();
		Rele.CheckedChanged -= Rele_CheckedChanged;
		Rele.Checked = false;
		Rele.CheckedChanged += Rele_CheckedChanged;
		InviaComando(MainMenuForm.TestElectronic, "Start Test");
		if (Car.Type == 1)
		{
			InviaComando(MainMenuForm.TestElectronic, "Active");
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Passive");
		}
		InviaComando(MainMenuForm.TestElectronic, "Select OUT:" + Car.Signal);
	}

	private void Rele_CheckedChanged(object sender, EventArgs e)
	{
		if (Rele.Checked)
		{
			ErrorCanBUS = false;
			InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
			Clear.BackColor = Color.FromArgb(255, 253, 253, 253);
			if (cmbComponent.SelectedIndex == 0)
			{
				StartABS();
				FillTable();
			}
			else
			{
				BaseString = 0;
				GetDataMemory.Enabled = false;
				StartGEAR();
			}
			InviaComando(MainMenuForm.TestElectronic, "Start Test");
			if (Car.Type == 1)
			{
				InviaComando(MainMenuForm.TestElectronic, "Active");
			}
			else
			{
				InviaComando(MainMenuForm.TestElectronic, "Passive");
			}
			InviaComando(MainMenuForm.TestElectronic, "Select OUT:" + Car.Signal);
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Comunication");
			InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
			InviaComando(MainMenuForm.TestElectronic, "Stop Test");
			Sistem.Delay(500.0);
			InviaComando(MainMenuForm.TestElectronic, "Comunication");
			Sistem.Delay(500.0);
		}
	}

	private void ReleExt_CheckedChanged(object sender, EventArgs e)
	{
		if (Car == null)
		{
			MessageBox.Show("Seleziona un dispositivo!!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			return;
		}
		if (Comunication.Text.IndexOf("None") == -1 && Comunication.Text.Replace("Comunication", "").Length > 3)
		{
			MessageBox.Show("Disable the ABS", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
		if (ReleExt.Checked)
		{
			InviaComando(MainMenuForm.TestElectronic, "Set ReleExt ON");
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Set ReleExt OFF");
		}
	}

	private void Active_CheckedChanged(object sender, EventArgs e)
	{
		if (Active.Checked)
		{
			InviaComando(MainMenuForm.TestElectronic, "Active");
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Passive");
		}
		Frequeza_Scroll(Frequenza, e);
	}

	private void Freno_CheckedChanged(object sender, EventArgs e)
	{
		if (Freno.Checked)
		{
			InviaComando(MainMenuForm.TestElectronic, "Push");
			InviaComando(MainMenuForm.TestHydraulic, "PUSH");
		}
		else
		{
			Text = "";
			InviaComando(MainMenuForm.TestElectronic, "Release");
			InviaComando(MainMenuForm.TestHydraulic, "RELEASE");
		}
	}

	private void Volt_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Volt");
	}

	private void Current_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Current");
	}

	private void Test_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Motor Test Enable");
	}

	private void Comunication_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Comunication");
	}

	private void MotorOff_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Turn Off Motor");
	}

	private void SetDelta_CheckedChanged(object sender, EventArgs e)
	{
		double result = 0.0;
		double result2 = 1.0;
		if (Front.Text.IndexOf(".") == -1 && Front.Text.IndexOf(",") == -1)
		{
			Front.Text += ",0";
		}
		if (Rear.Text.IndexOf(".") == -1 && Rear.Text.IndexOf(",") == -1)
		{
			Rear.Text += ",0";
		}
		if (double.TryParse(Front.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result) && double.TryParse(Rear.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2) && Frequency >= 1.0)
		{
			if (IDModel > -1)
			{
				DeltaSpeed = result / result2;
				Command.CommandText = "UPDATE Modelli SET DeltaSpeed = " + DeltaSpeed.ToString().Replace(",", ".") + " WHERE ID = " + IDModel;
				Command.Connection.Open();
				Command.ExecuteNonQuery();
				Command.Connection.Close();
				InviaComando(MainMenuForm.TestElectronic, "Set DeltaSpeed:" + DeltaSpeed.ToString().Replace(",", "."));
				InviaComando(MainMenuForm.TestElectronic, "Frequency:" + Frequenza.Value + "Hz");
			}
			else
			{
				MessageBox.Show("Seleziona modello.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
		}
		else
		{
			MessageBox.Show("Valore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private int FillTable(Button b)
	{
		int num = 0;
		Clear.BackColor = Color.FromArgb(255, 253, 253, 253);
		LastButton = b;
		FRAME fRAME = new FRAME();
		JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
		TableGear.Clear();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = " + b.Tag?.ToString() + " ORDER BY [Order]";
		adapter.Fill(TableGear);
		GearDataCAN.Clear();
		foreach (DataRow row in TableGear.Rows)
		{
			fRAME = new FRAME();
			fRAME.address1 = row["Address1"].ToString();
			fRAME.indx = (short)(int.Parse(row["Order"].ToString()) + BaseDataCAN.Count);
			fRAME.us = short.Parse(row["Delay"].ToString());
			fRAME.data = new List<byte>();
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
		short num2 = 0;
		List<FRAME> list = new List<FRAME>();
		BaseDataCAN.Clear();
		if (!TestCLUTCH.Equals(b) && !TestGEARBOX.Equals(b))
		{
			TableBase.Clear();
			Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + MainMenuForm.ID_Modello + " AND Test = 0 ORDER BY [Order]";
			adapter.Fill(TableBase);
			if (TableGear.Rows.Count - TableBase.Rows.Count > 2)
			{
				adapter.Fill(TableBase);
			}
			foreach (DataRow row2 in TableBase.Rows)
			{
				fRAME = new FRAME();
				fRAME.address1 = row2["Address1"].ToString();
				fRAME.indx = short.Parse(row2["Order"].ToString());
				fRAME.us = short.Parse(row2["Delay"].ToString());
				fRAME.data = new List<byte>();
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
			while (BaseDataCAN.Count > 0 && GearDataCAN.Count > 0)
			{
				fRAME = ((num2 % 2 != 0) ? GearDataCAN.Dequeue() : BaseDataCAN.Dequeue());
				fRAME.pos = num2++;
				list.Add(fRAME);
			}
			while (BaseDataCAN.Count > 0)
			{
				fRAME = BaseDataCAN.Dequeue();
				fRAME.pos = num2++;
				list.Add(fRAME);
			}
		}
		while (GearDataCAN.Count > 0)
		{
			fRAME = GearDataCAN.Dequeue();
			fRAME.pos = num2++;
			list.Add(fRAME);
		}
		List<FRAME> list2 = new List<FRAME>();
		if (MainMenuForm.N_STRING > 1)
		{
			list[list.Count - 1].pos *= -1;
		}
		foreach (FRAME item in list)
		{
			list2.Add(item);
			num += item.us;
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
		return num;
	}

	private void TestGEARBOX_Click(object sender, EventArgs e)
	{
		Count = -1;
		if (!TestGEARBOX.Equals(LastButton))
		{
			GetDataMemory.Enabled = false;
			FillTable(sender as Button);
		}
		InviaComando(MainMenuForm.TestElectronic, "Set GEARBOX");
	}

	private void TestCLUTCH_Click(object sender, EventArgs e)
	{
		Count = -1;
		InviaComando(MainMenuForm.TestElectronic, "Set Rele OFF");
		InviaComando(MainMenuForm.TestElectronic, "Stop Test");
		if (!TestCLUTCH.Equals(LastButton))
		{
			GetDataMemory.Enabled = false;
			FillTable(sender as Button);
		}
		else
		{
			Sistem.Delay(15000.0);
		}
		InviaComando(MainMenuForm.TestElectronic, "Set CLUTCH");
		InviaComando(MainMenuForm.TestElectronic, "Set Rele ON");
		InviaComando(MainMenuForm.TestElectronic, "Start Test");
	}

	private void Parking_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Parking");
	}

	private void btnDown_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Down");
	}

	private void btnUP_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set UP");
	}

	private void btnR_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position R");
	}

	private void btnN_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position N");
	}

	private void Alfa_KeyUp(object sender, KeyEventArgs e)
	{
		TextBox textBox = sender as TextBox;
		if (double.TryParse(textBox.Text.Replace('.', ','), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result))
		{
			string cmd = "Set Alfa:" + textBox.Tag?.ToString() + ";" + result.ToString().Replace(',', '.');
			if (e.KeyCode == Keys.Return)
			{
				InviaComando(MainMenuForm.TestElectronic, cmd);
			}
		}
		else
		{
			MessageBox.Show("Volore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private void btnD_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position D");
	}

	private void btnS_Click(object sender, EventArgs e)
	{
		GetDataMemory.Enabled = false;
		InviaComando(MainMenuForm.TestElectronic, "Set Position Change");
		FillTable(sender as Button);
		InviaComando(MainMenuForm.TestElectronic, "Set Position S");
	}

	private void StopGearLevel_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Set Position Stop");
	}

	private void Clear_Click(object sender, EventArgs e)
	{
		Report.Text = "";
	}

	private void GetDataMemory_Click(object sender, EventArgs e)
	{
		Clear.BackColor = Color.FromArgb(255, 253, 253, 253);
		InviaComando(MainMenuForm.TestElectronic, "Get Data Memory");
	}

	private void ResetMemory_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Erase Chip");
		ResetMemory.Enabled = false;
	}

	private void CheckCode_Click(object sender, EventArgs e)
	{
		InviaComando(MainMenuForm.TestElectronic, "Check Code");
	}

	private void ReleaseElectronic()
	{
		DateTime now = DateTime.Now;
		Polling.Stop();
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
	}

	private void WorkinigProgress_FormClosing(object sender, FormClosingEventArgs e)
	{
		if (Comunication.Text.IndexOf("None") == -1 && Comunication.Text.Replace("Comunication", "").Length > 3 && MessageBox.Show("Disable the ABS\r\n\r\nClose Anyway?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.No)
		{
			e.Cancel = true;
		}
		if (!e.Cancel)
		{
			ReleaseElectronic();
		}
	}

	private void SetSpeed_CheckedChanged(object sender, EventArgs e)
	{
		double result = 0.0;
		if (double.TryParse(Speed.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result) && Frequency >= 1.0)
		{
			if (IDModel > -1)
			{
				Coefficient = result / Frequency;
				label1.Text = (Frequency * Coefficient).ToString("##0.0 K/h");
				Command.CommandText = "UPDATE Modelli SET Coefficient = " + Coefficient.ToString().Replace(",", ".") + " WHERE ID = " + IDModel;
				Command.Connection.Open();
				Command.ExecuteNonQuery();
				Command.Connection.Close();
			}
			else
			{
				MessageBox.Show("Seleziona modello.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
		}
		else
		{
			MessageBox.Show("Valore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private void Resistor_KeyUp(object sender, KeyEventArgs e)
	{
		TextBox textBox = (TextBox)sender;
		if (e.KeyCode == Keys.Return)
		{
			if (int.TryParse(textBox.Text, out var _))
			{
				InviaComando(MainMenuForm.TestElectronic, "Set " + textBox.Name + ":" + textBox.Text);
			}
			else
			{
				MessageBox.Show("Valore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
		}
		else if (Copia.Checked)
		{
			if (Wheel1Res1.Equals(textBox))
			{
				Wheel2Res1.Text = Wheel1Res1.Text;
				Wheel3Res1.Text = Wheel1Res1.Text;
				Wheel4Res1.Text = Wheel1Res1.Text;
			}
			else
			{
				Wheel2Res2.Text = Wheel1Res2.Text;
				Wheel3Res2.Text = Wheel1Res2.Text;
				Wheel4Res2.Text = Wheel1Res2.Text;
			}
		}
	}

	private void Routa_CheckedChanged(object sender, EventArgs e)
	{
		CheckBox checkBox = (CheckBox)sender;
		if (checkBox.Checked)
		{
			InviaComando(MainMenuForm.TestElectronic, "Wheel Stop:" + checkBox.Tag);
		}
		else
		{
			InviaComando(MainMenuForm.TestElectronic, "Wheel Go:" + checkBox.Tag);
		}
	}

	private void SpeedTest_CheckedChanged(object sender, EventArgs e)
	{
		if (SpeedTest.Checked)
		{
			CheckBox[] wheel = Wheel;
			foreach (Control control in wheel)
			{
				control.Enabled = true;
			}
			SpeedTimer.Enabled = true;
			InviaComando(MainMenuForm.TestElectronic, "Frequency:" + Frequenza.Value + "Hz");
			InviaComando(MainMenuForm.TestElectronic, "Select OUT:" + Car.Signal);
			if (Car.Type == 1)
			{
				InviaComando(MainMenuForm.TestElectronic, "Active");
			}
			else
			{
				InviaComando(MainMenuForm.TestElectronic, "Passive");
			}
		}
		else
		{
			SpeedTimer.Enabled = false;
		}
	}

	private void SpeedTimer_Tick(object sender, EventArgs e)
	{
		short num = 20;
		if (Freno.Checked)
		{
			num *= -1;
		}
		if (Frequenza.Value + num < 0)
		{
			Frequenza.Value = 0;
		}
		else
		{
			Frequenza.Value += num;
		}
		if (Frequenza.Value > 1050)
		{
			Frequenza.Value = 1050;
		}
		InviaComando(MainMenuForm.TestElectronic, "Frequency:" + Frequenza.Value + "Hz");
		CheckBox[] wheel = Wheel;
		foreach (CheckBox checkBox in wheel)
		{
			if (checkBox.Checked)
			{
				InviaComando(MainMenuForm.TestElectronic, "Wheel Stop:" + checkBox.Tag);
			}
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
		this.Sensor = new System.Windows.Forms.GroupBox();
		this.SetDelta = new System.Windows.Forms.CheckBox();
		this.Rear = new System.Windows.Forms.TextBox();
		this.Front = new System.Windows.Forms.TextBox();
		this.SetSpeed = new System.Windows.Forms.CheckBox();
		this.Speed = new System.Windows.Forms.TextBox();
		this.SpeedTest = new System.Windows.Forms.CheckBox();
		this.Routa4 = new System.Windows.Forms.CheckBox();
		this.label1 = new System.Windows.Forms.Label();
		this.Ruota3 = new System.Windows.Forms.CheckBox();
		this.Frequenza = new System.Windows.Forms.TrackBar();
		this.Routa2 = new System.Windows.Forms.CheckBox();
		this.Sinusoidale = new System.Windows.Forms.RadioButton();
		this.Ruota1 = new System.Windows.Forms.CheckBox();
		this.Quadra12 = new System.Windows.Forms.RadioButton();
		this.Quadra5 = new System.Windows.Forms.RadioButton();
		this.Disablilita = new System.Windows.Forms.RadioButton();
		this.Active = new System.Windows.Forms.RadioButton();
		this.Report = new System.Windows.Forms.TextBox();
		this.Polling = new System.Windows.Forms.Timer(this.components);
		this.Passive = new System.Windows.Forms.RadioButton();
		this.SignalOUT = new System.Windows.Forms.GroupBox();
		this.DisableSpeed = new System.Windows.Forms.Button();
		this.Engine = new System.Windows.Forms.Button();
		this.ReleExt = new System.Windows.Forms.CheckBox();
		this.Freno = new System.Windows.Forms.CheckBox();
		this.Rele = new System.Windows.Forms.CheckBox();
		this.SignalIN = new System.Windows.Forms.GroupBox();
		this.Current = new System.Windows.Forms.Button();
		this.Volt = new System.Windows.Forms.Button();
		this.SpeedTimer = new System.Windows.Forms.Timer(this.components);
		this.ReportTimer = new System.Windows.Forms.Timer(this.components);
		this.label2 = new System.Windows.Forms.Label();
		this.SelezionaModello = new System.Windows.Forms.Button();
		this.Stop = new System.Windows.Forms.Button();
		this.label3 = new System.Windows.Forms.Label();
		this.Motor = new System.Windows.Forms.Button();
		this.Valve = new System.Windows.Forms.Button();
		this.Comunication = new System.Windows.Forms.Label();
		this.cmbComponent = new System.Windows.Forms.ComboBox();
		this.StartCAN = new System.Windows.Forms.GroupBox();
		this.MotorOff = new System.Windows.Forms.Button();
		this.CheckCode = new System.Windows.Forms.Button();
		this.TestGEARBOX = new System.Windows.Forms.Button();
		this.ImportFile = new System.Windows.Forms.OpenFileDialog();
		this.Wheel1 = new System.Windows.Forms.GroupBox();
		this.Copia = new System.Windows.Forms.CheckBox();
		this.Wheel1Res1 = new System.Windows.Forms.TextBox();
		this.label6 = new System.Windows.Forms.Label();
		this.Wheel1Res2 = new System.Windows.Forms.TextBox();
		this.label7 = new System.Windows.Forms.Label();
		this.Wheel4 = new System.Windows.Forms.GroupBox();
		this.Wheel4Res1 = new System.Windows.Forms.TextBox();
		this.label14 = new System.Windows.Forms.Label();
		this.Wheel4Res2 = new System.Windows.Forms.TextBox();
		this.label15 = new System.Windows.Forms.Label();
		this.Wheel3 = new System.Windows.Forms.GroupBox();
		this.Wheel3Res1 = new System.Windows.Forms.TextBox();
		this.label12 = new System.Windows.Forms.Label();
		this.Wheel3Res2 = new System.Windows.Forms.TextBox();
		this.label13 = new System.Windows.Forms.Label();
		this.Wheel2 = new System.Windows.Forms.GroupBox();
		this.Wheel2Res1 = new System.Windows.Forms.TextBox();
		this.label10 = new System.Windows.Forms.Label();
		this.Wheel2Res2 = new System.Windows.Forms.TextBox();
		this.label11 = new System.Windows.Forms.Label();
		this.btnDown = new System.Windows.Forms.Button();
		this.btnUP = new System.Windows.Forms.Button();
		this.btnD = new System.Windows.Forms.Button();
		this.btnS = new System.Windows.Forms.Button();
		this.btnN = new System.Windows.Forms.Button();
		this.btnR = new System.Windows.Forms.Button();
		this.Parking = new System.Windows.Forms.Button();
		this.StopGearLevel = new System.Windows.Forms.Label();
		this.Clear = new System.Windows.Forms.Button();
		this.TestCLUTCH = new System.Windows.Forms.Button();
		this.GetDataMemory = new System.Windows.Forms.Button();
		this.Gear = new System.Windows.Forms.GroupBox();
		this.ResetMemory = new System.Windows.Forms.Button();
		this.Stato = new System.Windows.Forms.Label();
		this.Alfa4 = new System.Windows.Forms.TextBox();
		this.label23 = new System.Windows.Forms.Label();
		this.Alfa3 = new System.Windows.Forms.TextBox();
		this.label24 = new System.Windows.Forms.Label();
		this.Alfa2 = new System.Windows.Forms.TextBox();
		this.label25 = new System.Windows.Forms.Label();
		this.Alfa1 = new System.Windows.Forms.TextBox();
		this.label26 = new System.Windows.Forms.Label();
		this.Sensor.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequenza).BeginInit();
		this.SignalOUT.SuspendLayout();
		this.SignalIN.SuspendLayout();
		this.StartCAN.SuspendLayout();
		this.Wheel1.SuspendLayout();
		this.Wheel4.SuspendLayout();
		this.Wheel3.SuspendLayout();
		this.Wheel2.SuspendLayout();
		this.Gear.SuspendLayout();
		base.SuspendLayout();
		this.Sensor.Controls.Add(this.SetDelta);
		this.Sensor.Controls.Add(this.Rear);
		this.Sensor.Controls.Add(this.Front);
		this.Sensor.Controls.Add(this.SetSpeed);
		this.Sensor.Controls.Add(this.Speed);
		this.Sensor.Controls.Add(this.SpeedTest);
		this.Sensor.Controls.Add(this.Routa4);
		this.Sensor.Controls.Add(this.label1);
		this.Sensor.Controls.Add(this.Ruota3);
		this.Sensor.Controls.Add(this.Frequenza);
		this.Sensor.Controls.Add(this.Routa2);
		this.Sensor.Controls.Add(this.Sinusoidale);
		this.Sensor.Controls.Add(this.Ruota1);
		this.Sensor.Controls.Add(this.Quadra12);
		this.Sensor.Controls.Add(this.Quadra5);
		this.Sensor.Controls.Add(this.Disablilita);
		this.Sensor.Enabled = false;
		this.Sensor.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Sensor.Location = new System.Drawing.Point(12, 12);
		this.Sensor.Name = "Sensor";
		this.Sensor.Size = new System.Drawing.Size(246, 337);
		this.Sensor.TabIndex = 6;
		this.Sensor.TabStop = false;
		this.Sensor.Text = "Sensor";
		this.SetDelta.Appearance = System.Windows.Forms.Appearance.Button;
		this.SetDelta.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.SetDelta.Location = new System.Drawing.Point(118, 297);
		this.SetDelta.Name = "SetDelta";
		this.SetDelta.Size = new System.Drawing.Size(122, 26);
		this.SetDelta.TabIndex = 24;
		this.SetDelta.Tag = "3";
		this.SetDelta.Text = "Set Delta Speed";
		this.SetDelta.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.SetDelta.UseVisualStyleBackColor = true;
		this.SetDelta.CheckedChanged += new System.EventHandler(SetDelta_CheckedChanged);
		this.Rear.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Rear.Location = new System.Drawing.Point(54, 299);
		this.Rear.Name = "Rear";
		this.Rear.Size = new System.Drawing.Size(45, 22);
		this.Rear.TabIndex = 23;
		this.Front.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Front.Location = new System.Drawing.Point(8, 299);
		this.Front.Name = "Front";
		this.Front.Size = new System.Drawing.Size(45, 22);
		this.Front.TabIndex = 22;
		this.SetSpeed.Appearance = System.Windows.Forms.Appearance.Button;
		this.SetSpeed.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.SetSpeed.Location = new System.Drawing.Point(118, 269);
		this.SetSpeed.Name = "SetSpeed";
		this.SetSpeed.Size = new System.Drawing.Size(122, 26);
		this.SetSpeed.TabIndex = 21;
		this.SetSpeed.Tag = "3";
		this.SetSpeed.Text = "Set Speed";
		this.SetSpeed.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.SetSpeed.UseVisualStyleBackColor = true;
		this.SetSpeed.CheckedChanged += new System.EventHandler(SetSpeed_CheckedChanged);
		this.Speed.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Speed.Location = new System.Drawing.Point(8, 271);
		this.Speed.Name = "Speed";
		this.Speed.Size = new System.Drawing.Size(91, 22);
		this.Speed.TabIndex = 20;
		this.SpeedTest.Appearance = System.Windows.Forms.Appearance.Button;
		this.SpeedTest.Enabled = false;
		this.SpeedTest.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.SpeedTest.Location = new System.Drawing.Point(77, 93);
		this.SpeedTest.Name = "SpeedTest";
		this.SpeedTest.Size = new System.Drawing.Size(92, 26);
		this.SpeedTest.TabIndex = 19;
		this.SpeedTest.Tag = "2";
		this.SpeedTest.Text = "Speed Test";
		this.SpeedTest.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.SpeedTest.UseVisualStyleBackColor = true;
		this.SpeedTest.CheckedChanged += new System.EventHandler(SpeedTest_CheckedChanged);
		this.Routa4.Appearance = System.Windows.Forms.Appearance.Button;
		this.Routa4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Routa4.Location = new System.Drawing.Point(130, 157);
		this.Routa4.Name = "Routa4";
		this.Routa4.Size = new System.Drawing.Size(104, 26);
		this.Routa4.TabIndex = 18;
		this.Routa4.Tag = "3";
		this.Routa4.Text = "Wheel4";
		this.Routa4.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Routa4.UseVisualStyleBackColor = true;
		this.Routa4.CheckedChanged += new System.EventHandler(Routa_CheckedChanged);
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(84, 201);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(71, 16);
		this.label1.TabIndex = 5;
		this.label1.Text = "Frequency";
		this.Ruota3.Appearance = System.Windows.Forms.Appearance.Button;
		this.Ruota3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Ruota3.Location = new System.Drawing.Point(8, 157);
		this.Ruota3.Name = "Ruota3";
		this.Ruota3.Size = new System.Drawing.Size(91, 26);
		this.Ruota3.TabIndex = 17;
		this.Ruota3.Tag = "2";
		this.Ruota3.Text = "Wheel3";
		this.Ruota3.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Ruota3.UseVisualStyleBackColor = true;
		this.Ruota3.CheckedChanged += new System.EventHandler(Routa_CheckedChanged);
		this.Frequenza.Location = new System.Drawing.Point(8, 220);
		this.Frequenza.Maximum = 2000;
		this.Frequenza.Name = "Frequenza";
		this.Frequenza.Size = new System.Drawing.Size(226, 45);
		this.Frequenza.TabIndex = 4;
		this.Frequenza.Scroll += new System.EventHandler(Frequeza_Scroll);
		this.Routa2.Appearance = System.Windows.Forms.Appearance.Button;
		this.Routa2.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Routa2.Location = new System.Drawing.Point(130, 125);
		this.Routa2.Name = "Routa2";
		this.Routa2.Size = new System.Drawing.Size(104, 26);
		this.Routa2.TabIndex = 16;
		this.Routa2.Tag = "1";
		this.Routa2.Text = "Wheel2";
		this.Routa2.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Routa2.UseVisualStyleBackColor = true;
		this.Routa2.CheckedChanged += new System.EventHandler(Routa_CheckedChanged);
		this.Sinusoidale.Appearance = System.Windows.Forms.Appearance.Button;
		this.Sinusoidale.AutoSize = true;
		this.Sinusoidale.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Sinusoidale.Location = new System.Drawing.Point(8, 55);
		this.Sinusoidale.Name = "Sinusoidale";
		this.Sinusoidale.Size = new System.Drawing.Size(80, 26);
		this.Sinusoidale.TabIndex = 2;
		this.Sinusoidale.Tag = "3";
		this.Sinusoidale.Text = "Sinusoidal";
		this.Sinusoidale.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Sinusoidale.UseVisualStyleBackColor = true;
		this.Sinusoidale.CheckedChanged += new System.EventHandler(Select_CheckedChanged);
		this.Ruota1.Appearance = System.Windows.Forms.Appearance.Button;
		this.Ruota1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Ruota1.Location = new System.Drawing.Point(8, 125);
		this.Ruota1.Name = "Ruota1";
		this.Ruota1.Size = new System.Drawing.Size(91, 26);
		this.Ruota1.TabIndex = 15;
		this.Ruota1.Tag = "0";
		this.Ruota1.Text = "Wheel1";
		this.Ruota1.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Ruota1.UseVisualStyleBackColor = true;
		this.Ruota1.CheckedChanged += new System.EventHandler(Routa_CheckedChanged);
		this.Quadra12.Appearance = System.Windows.Forms.Appearance.Button;
		this.Quadra12.AutoSize = true;
		this.Quadra12.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Quadra12.Location = new System.Drawing.Point(129, 55);
		this.Quadra12.Name = "Quadra12";
		this.Quadra12.Size = new System.Drawing.Size(104, 26);
		this.Quadra12.TabIndex = 3;
		this.Quadra12.Tag = "1";
		this.Quadra12.Text = "Square 12 Volt";
		this.Quadra12.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Quadra12.UseVisualStyleBackColor = true;
		this.Quadra12.CheckedChanged += new System.EventHandler(Select_CheckedChanged);
		this.Quadra5.Appearance = System.Windows.Forms.Appearance.Button;
		this.Quadra5.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Quadra5.Location = new System.Drawing.Point(129, 23);
		this.Quadra5.Name = "Quadra5";
		this.Quadra5.Size = new System.Drawing.Size(105, 26);
		this.Quadra5.TabIndex = 1;
		this.Quadra5.Tag = "2";
		this.Quadra5.Text = "Square 5 Volt";
		this.Quadra5.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Quadra5.UseVisualStyleBackColor = true;
		this.Quadra5.CheckedChanged += new System.EventHandler(Select_CheckedChanged);
		this.Disablilita.Appearance = System.Windows.Forms.Appearance.Button;
		this.Disablilita.Checked = true;
		this.Disablilita.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Disablilita.Location = new System.Drawing.Point(8, 23);
		this.Disablilita.Name = "Disablilita";
		this.Disablilita.Size = new System.Drawing.Size(81, 26);
		this.Disablilita.TabIndex = 0;
		this.Disablilita.TabStop = true;
		this.Disablilita.Tag = "0";
		this.Disablilita.Text = "Disable";
		this.Disablilita.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Disablilita.UseVisualStyleBackColor = true;
		this.Disablilita.CheckedChanged += new System.EventHandler(Select_CheckedChanged);
		this.Active.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Active.Location = new System.Drawing.Point(113, 30);
		this.Active.Name = "Active";
		this.Active.Size = new System.Drawing.Size(81, 26);
		this.Active.TabIndex = 7;
		this.Active.Tag = "2";
		this.Active.Text = "Active";
		this.Active.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Active.UseVisualStyleBackColor = true;
		this.Active.CheckedChanged += new System.EventHandler(Active_CheckedChanged);
		this.Report.Location = new System.Drawing.Point(12, 605);
		this.Report.Multiline = true;
		this.Report.Name = "Report";
		this.Report.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
		this.Report.Size = new System.Drawing.Size(719, 420);
		this.Report.TabIndex = 9;
		this.Polling.Enabled = true;
		this.Polling.Interval = 300;
		this.Polling.Tick += new System.EventHandler(Polling_Tick);
		this.Passive.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Passive.Location = new System.Drawing.Point(113, 55);
		this.Passive.Name = "Passive";
		this.Passive.Size = new System.Drawing.Size(81, 26);
		this.Passive.TabIndex = 8;
		this.Passive.Tag = "2";
		this.Passive.Text = "Passive";
		this.Passive.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Passive.UseVisualStyleBackColor = true;
		this.SignalOUT.Controls.Add(this.DisableSpeed);
		this.SignalOUT.Controls.Add(this.Engine);
		this.SignalOUT.Controls.Add(this.ReleExt);
		this.SignalOUT.Controls.Add(this.Freno);
		this.SignalOUT.Controls.Add(this.Rele);
		this.SignalOUT.Controls.Add(this.Active);
		this.SignalOUT.Controls.Add(this.Passive);
		this.SignalOUT.Enabled = false;
		this.SignalOUT.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.SignalOUT.Location = new System.Drawing.Point(264, 12);
		this.SignalOUT.Name = "SignalOUT";
		this.SignalOUT.Size = new System.Drawing.Size(200, 151);
		this.SignalOUT.TabIndex = 10;
		this.SignalOUT.TabStop = false;
		this.SignalOUT.Text = "Signal OUT";
		this.DisableSpeed.AutoSize = true;
		this.DisableSpeed.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.DisableSpeed.Location = new System.Drawing.Point(93, 118);
		this.DisableSpeed.Name = "DisableSpeed";
		this.DisableSpeed.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.DisableSpeed.Size = new System.Drawing.Size(105, 26);
		this.DisableSpeed.TabIndex = 562;
		this.DisableSpeed.Text = "DisableSpeed";
		this.DisableSpeed.Click += new System.EventHandler(DisableSpeed_Click);
		this.Engine.AutoSize = true;
		this.Engine.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Engine.Location = new System.Drawing.Point(93, 86);
		this.Engine.Name = "Engine";
		this.Engine.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.Engine.Size = new System.Drawing.Size(101, 26);
		this.Engine.TabIndex = 561;
		this.Engine.Text = "Engine";
		this.Engine.Click += new System.EventHandler(Engine_Click);
		this.ReleExt.Appearance = System.Windows.Forms.Appearance.Button;
		this.ReleExt.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.ReleExt.Location = new System.Drawing.Point(6, 33);
		this.ReleExt.Name = "ReleExt";
		this.ReleExt.Size = new System.Drawing.Size(81, 26);
		this.ReleExt.TabIndex = 12;
		this.ReleExt.Tag = "2";
		this.ReleExt.Text = "Rele Ext";
		this.ReleExt.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.ReleExt.UseVisualStyleBackColor = true;
		this.ReleExt.CheckedChanged += new System.EventHandler(ReleExt_CheckedChanged);
		this.Freno.Appearance = System.Windows.Forms.Appearance.Button;
		this.Freno.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Freno.Location = new System.Drawing.Point(6, 118);
		this.Freno.Name = "Freno";
		this.Freno.Size = new System.Drawing.Size(81, 26);
		this.Freno.TabIndex = 9;
		this.Freno.Tag = "2";
		this.Freno.Text = "Freno";
		this.Freno.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Freno.UseVisualStyleBackColor = true;
		this.Freno.CheckedChanged += new System.EventHandler(Freno_CheckedChanged);
		this.Rele.Appearance = System.Windows.Forms.Appearance.Button;
		this.Rele.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Rele.Location = new System.Drawing.Point(6, 86);
		this.Rele.Name = "Rele";
		this.Rele.Size = new System.Drawing.Size(81, 26);
		this.Rele.TabIndex = 6;
		this.Rele.Tag = "2";
		this.Rele.Text = "Rele";
		this.Rele.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
		this.Rele.UseVisualStyleBackColor = true;
		this.Rele.CheckedChanged += new System.EventHandler(Rele_CheckedChanged);
		this.SignalIN.Controls.Add(this.Current);
		this.SignalIN.Controls.Add(this.Volt);
		this.SignalIN.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.SignalIN.Location = new System.Drawing.Point(264, 169);
		this.SignalIN.Name = "SignalIN";
		this.SignalIN.Size = new System.Drawing.Size(206, 100);
		this.SignalIN.TabIndex = 11;
		this.SignalIN.TabStop = false;
		this.SignalIN.Text = "Signal IN";
		this.Current.AutoSize = true;
		this.Current.Location = new System.Drawing.Point(115, 44);
		this.Current.Name = "Current";
		this.Current.Size = new System.Drawing.Size(79, 30);
		this.Current.TabIndex = 1;
		this.Current.Text = "Current";
		this.Current.Click += new System.EventHandler(Current_Click);
		this.Volt.AutoSize = true;
		this.Volt.Location = new System.Drawing.Point(8, 44);
		this.Volt.Name = "Volt";
		this.Volt.Size = new System.Drawing.Size(85, 30);
		this.Volt.TabIndex = 0;
		this.Volt.Text = "Volt";
		this.Volt.Click += new System.EventHandler(Volt_Click);
		this.SpeedTimer.Interval = 1000;
		this.SpeedTimer.Tick += new System.EventHandler(SpeedTimer_Tick);
		this.ReportTimer.Enabled = true;
		this.ReportTimer.Interval = 200;
		this.ReportTimer.Tick += new System.EventHandler(ReportTimer_Tick);
		this.label2.AutoSize = true;
		this.label2.Location = new System.Drawing.Point(29, 128);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(0, 20);
		this.label2.TabIndex = 0;
		this.SelezionaModello.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.SelezionaModello.Location = new System.Drawing.Point(18, 118);
		this.SelezionaModello.Name = "SelezionaModello";
		this.SelezionaModello.Size = new System.Drawing.Size(104, 47);
		this.SelezionaModello.TabIndex = 8;
		this.SelezionaModello.Text = "Select Model";
		this.SelezionaModello.UseVisualStyleBackColor = true;
		this.SelezionaModello.Click += new System.EventHandler(SelezionaModello_Click);
		this.Stop.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Stop.Location = new System.Drawing.Point(18, 174);
		this.Stop.Name = "Stop";
		this.Stop.Size = new System.Drawing.Size(104, 47);
		this.Stop.TabIndex = 1;
		this.Stop.Text = "Stop";
		this.Stop.UseVisualStyleBackColor = true;
		this.Stop.Click += new System.EventHandler(Stop_Click);
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(14, 71);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(0, 16);
		this.label3.TabIndex = 9;
		this.Motor.AutoSize = true;
		this.Motor.Enabled = false;
		this.Motor.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Motor.Location = new System.Drawing.Point(144, 197);
		this.Motor.Name = "Motor";
		this.Motor.Size = new System.Drawing.Size(105, 26);
		this.Motor.TabIndex = 12;
		this.Motor.Tag = "1";
		this.Motor.Text = "Test Motor";
		this.Motor.Click += new System.EventHandler(Test_Click);
		this.Valve.AutoSize = true;
		this.Valve.Enabled = false;
		this.Valve.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.Valve.Location = new System.Drawing.Point(17, 228);
		this.Valve.Name = "Valve";
		this.Valve.Size = new System.Drawing.Size(105, 26);
		this.Valve.TabIndex = 13;
		this.Valve.Tag = "2";
		this.Valve.Text = "Test Valve";
		this.Valve.Click += new System.EventHandler(Test_Click);
		this.Comunication.AutoSize = true;
		this.Comunication.Cursor = System.Windows.Forms.Cursors.Hand;
		this.Comunication.Location = new System.Drawing.Point(14, 29);
		this.Comunication.Name = "Comunication";
		this.Comunication.Size = new System.Drawing.Size(118, 20);
		this.Comunication.TabIndex = 19;
		this.Comunication.Text = "Comunication";
		this.Comunication.Click += new System.EventHandler(Comunication_Click);
		this.cmbComponent.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbComponent.FormattingEnabled = true;
		this.cmbComponent.Items.AddRange(new object[2] { "ABS", "Cambi" });
		this.cmbComponent.Location = new System.Drawing.Point(144, 125);
		this.cmbComponent.Name = "cmbComponent";
		this.cmbComponent.Size = new System.Drawing.Size(104, 28);
		this.cmbComponent.TabIndex = 20;
		this.StartCAN.Controls.Add(this.MotorOff);
		this.StartCAN.Controls.Add(this.CheckCode);
		this.StartCAN.Controls.Add(this.cmbComponent);
		this.StartCAN.Controls.Add(this.Comunication);
		this.StartCAN.Controls.Add(this.Valve);
		this.StartCAN.Controls.Add(this.Motor);
		this.StartCAN.Controls.Add(this.label3);
		this.StartCAN.Controls.Add(this.Stop);
		this.StartCAN.Controls.Add(this.SelezionaModello);
		this.StartCAN.Controls.Add(this.label2);
		this.StartCAN.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.StartCAN.Location = new System.Drawing.Point(476, 12);
		this.StartCAN.Name = "StartCAN";
		this.StartCAN.Size = new System.Drawing.Size(255, 257);
		this.StartCAN.TabIndex = 7;
		this.StartCAN.TabStop = false;
		this.StartCAN.Text = "Test ABS";
		this.MotorOff.AutoSize = true;
		this.MotorOff.Enabled = false;
		this.MotorOff.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.MotorOff.Location = new System.Drawing.Point(144, 228);
		this.MotorOff.Name = "MotorOff";
		this.MotorOff.Size = new System.Drawing.Size(105, 26);
		this.MotorOff.TabIndex = 22;
		this.MotorOff.Tag = "1";
		this.MotorOff.Text = "Motor Off";
		this.MotorOff.Click += new System.EventHandler(MotorOff_Click);
		this.CheckCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.CheckCode.Location = new System.Drawing.Point(145, 172);
		this.CheckCode.Name = "CheckCode";
		this.CheckCode.Size = new System.Drawing.Size(104, 23);
		this.CheckCode.TabIndex = 21;
		this.CheckCode.Text = "Check Code";
		this.CheckCode.UseVisualStyleBackColor = true;
		this.CheckCode.Click += new System.EventHandler(CheckCode_Click);
		this.TestGEARBOX.AutoSize = true;
		this.TestGEARBOX.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.TestGEARBOX.Location = new System.Drawing.Point(19, 28);
		this.TestGEARBOX.Name = "TestGEARBOX";
		this.TestGEARBOX.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.TestGEARBOX.Size = new System.Drawing.Size(200, 30);
		this.TestGEARBOX.TabIndex = 12;
		this.TestGEARBOX.Tag = "1";
		this.TestGEARBOX.Text = "GEARBOX ACTUATOR TEST";
		this.TestGEARBOX.Click += new System.EventHandler(TestGEARBOX_Click);
		this.ImportFile.Filter = "trc|*trc|all|*.*";
		this.Wheel1.Controls.Add(this.Copia);
		this.Wheel1.Controls.Add(this.Wheel1Res1);
		this.Wheel1.Controls.Add(this.label6);
		this.Wheel1.Controls.Add(this.Wheel1Res2);
		this.Wheel1.Controls.Add(this.label7);
		this.Wheel1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel1.Location = new System.Drawing.Point(20, 422);
		this.Wheel1.Name = "Wheel1";
		this.Wheel1.Size = new System.Drawing.Size(132, 96);
		this.Wheel1.TabIndex = 546;
		this.Wheel1.TabStop = false;
		this.Wheel1.Text = "Wheel1";
		this.Copia.AutoSize = true;
		this.Copia.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Copia.Location = new System.Drawing.Point(-2, 19);
		this.Copia.Name = "Copia";
		this.Copia.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.Copia.Size = new System.Drawing.Size(67, 20);
		this.Copia.TabIndex = 546;
		this.Copia.Text = "Copia";
		this.Copia.UseVisualStyleBackColor = true;
		this.Wheel1Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel1Res1.Location = new System.Drawing.Point(56, 40);
		this.Wheel1Res1.Name = "Wheel1Res1";
		this.Wheel1Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel1Res1.TabIndex = 10;
		this.Wheel1Res1.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(1, 44);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(47, 16);
		this.label6.TabIndex = 528;
		this.label6.Text = "Res1:";
		this.Wheel1Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel1Res2.Location = new System.Drawing.Point(56, 66);
		this.Wheel1Res2.Name = "Wheel1Res2";
		this.Wheel1Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel1Res2.TabIndex = 11;
		this.Wheel1Res2.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label7.AutoSize = true;
		this.label7.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label7.Location = new System.Drawing.Point(1, 70);
		this.label7.Name = "label7";
		this.label7.Size = new System.Drawing.Size(47, 16);
		this.label7.TabIndex = 530;
		this.label7.Text = "Res2:";
		this.Wheel4.Controls.Add(this.Wheel4Res1);
		this.Wheel4.Controls.Add(this.label14);
		this.Wheel4.Controls.Add(this.Wheel4Res2);
		this.Wheel4.Controls.Add(this.label15);
		this.Wheel4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel4.Location = new System.Drawing.Point(605, 422);
		this.Wheel4.Name = "Wheel4";
		this.Wheel4.Size = new System.Drawing.Size(132, 96);
		this.Wheel4.TabIndex = 551;
		this.Wheel4.TabStop = false;
		this.Wheel4.Text = "Wheel4";
		this.Wheel4Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel4Res1.Location = new System.Drawing.Point(56, 40);
		this.Wheel4Res1.Name = "Wheel4Res1";
		this.Wheel4Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel4Res1.TabIndex = 10;
		this.Wheel4Res1.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label14.AutoSize = true;
		this.label14.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label14.Location = new System.Drawing.Point(1, 44);
		this.label14.Name = "label14";
		this.label14.Size = new System.Drawing.Size(47, 16);
		this.label14.TabIndex = 528;
		this.label14.Text = "Res1:";
		this.Wheel4Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel4Res2.Location = new System.Drawing.Point(56, 66);
		this.Wheel4Res2.Name = "Wheel4Res2";
		this.Wheel4Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel4Res2.TabIndex = 11;
		this.Wheel4Res2.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label15.AutoSize = true;
		this.label15.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label15.Location = new System.Drawing.Point(1, 70);
		this.label15.Name = "label15";
		this.label15.Size = new System.Drawing.Size(47, 16);
		this.label15.TabIndex = 530;
		this.label15.Text = "Res2:";
		this.Wheel3.Controls.Add(this.Wheel3Res1);
		this.Wheel3.Controls.Add(this.label12);
		this.Wheel3.Controls.Add(this.Wheel3Res2);
		this.Wheel3.Controls.Add(this.label13);
		this.Wheel3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel3.Location = new System.Drawing.Point(410, 422);
		this.Wheel3.Name = "Wheel3";
		this.Wheel3.Size = new System.Drawing.Size(132, 96);
		this.Wheel3.TabIndex = 550;
		this.Wheel3.TabStop = false;
		this.Wheel3.Text = "Wheel3";
		this.Wheel3Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel3Res1.Location = new System.Drawing.Point(56, 40);
		this.Wheel3Res1.Name = "Wheel3Res1";
		this.Wheel3Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel3Res1.TabIndex = 10;
		this.Wheel3Res1.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label12.AutoSize = true;
		this.label12.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label12.Location = new System.Drawing.Point(1, 44);
		this.label12.Name = "label12";
		this.label12.Size = new System.Drawing.Size(47, 16);
		this.label12.TabIndex = 528;
		this.label12.Text = "Res1:";
		this.Wheel3Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel3Res2.Location = new System.Drawing.Point(56, 66);
		this.Wheel3Res2.Name = "Wheel3Res2";
		this.Wheel3Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel3Res2.TabIndex = 11;
		this.Wheel3Res2.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label13.AutoSize = true;
		this.label13.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label13.Location = new System.Drawing.Point(1, 70);
		this.label13.Name = "label13";
		this.label13.Size = new System.Drawing.Size(47, 16);
		this.label13.TabIndex = 530;
		this.label13.Text = "Res2:";
		this.Wheel2.Controls.Add(this.Wheel2Res1);
		this.Wheel2.Controls.Add(this.label10);
		this.Wheel2.Controls.Add(this.Wheel2Res2);
		this.Wheel2.Controls.Add(this.label11);
		this.Wheel2.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel2.Location = new System.Drawing.Point(215, 422);
		this.Wheel2.Name = "Wheel2";
		this.Wheel2.Size = new System.Drawing.Size(132, 96);
		this.Wheel2.TabIndex = 549;
		this.Wheel2.TabStop = false;
		this.Wheel2.Text = "Wheel2";
		this.Wheel2Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel2Res1.Location = new System.Drawing.Point(56, 40);
		this.Wheel2Res1.Name = "Wheel2Res1";
		this.Wheel2Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel2Res1.TabIndex = 10;
		this.Wheel2Res1.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label10.AutoSize = true;
		this.label10.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label10.Location = new System.Drawing.Point(1, 44);
		this.label10.Name = "label10";
		this.label10.Size = new System.Drawing.Size(47, 16);
		this.label10.TabIndex = 528;
		this.label10.Text = "Res1:";
		this.Wheel2Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel2Res2.Location = new System.Drawing.Point(56, 66);
		this.Wheel2Res2.Name = "Wheel2Res2";
		this.Wheel2Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel2Res2.TabIndex = 11;
		this.Wheel2Res2.KeyUp += new System.Windows.Forms.KeyEventHandler(Resistor_KeyUp);
		this.label11.AutoSize = true;
		this.label11.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label11.Location = new System.Drawing.Point(1, 70);
		this.label11.Name = "label11";
		this.label11.Size = new System.Drawing.Size(47, 16);
		this.label11.TabIndex = 530;
		this.label11.Text = "Res2:";
		this.btnDown.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnDown.Location = new System.Drawing.Point(105, 87);
		this.btnDown.Name = "btnDown";
		this.btnDown.Size = new System.Drawing.Size(48, 41);
		this.btnDown.TabIndex = 557;
		this.btnDown.Tag = "4";
		this.btnDown.Text = "-";
		this.btnDown.UseVisualStyleBackColor = true;
		this.btnDown.Click += new System.EventHandler(btnDown_Click);
		this.btnUP.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnUP.Location = new System.Drawing.Point(159, 87);
		this.btnUP.Name = "btnUP";
		this.btnUP.Size = new System.Drawing.Size(48, 41);
		this.btnUP.TabIndex = 556;
		this.btnUP.Tag = "5";
		this.btnUP.Text = "+";
		this.btnUP.UseVisualStyleBackColor = true;
		this.btnUP.Click += new System.EventHandler(btnUP_Click);
		this.btnD.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnD.Location = new System.Drawing.Point(321, 87);
		this.btnD.Name = "btnD";
		this.btnD.Size = new System.Drawing.Size(48, 41);
		this.btnD.TabIndex = 555;
		this.btnD.Tag = "8";
		this.btnD.Text = "D";
		this.btnD.UseVisualStyleBackColor = true;
		this.btnD.Click += new System.EventHandler(btnD_Click);
		this.btnS.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnS.Location = new System.Drawing.Point(375, 87);
		this.btnS.Name = "btnS";
		this.btnS.Size = new System.Drawing.Size(48, 41);
		this.btnS.TabIndex = 554;
		this.btnS.Tag = "9";
		this.btnS.Text = "S";
		this.btnS.UseVisualStyleBackColor = true;
		this.btnS.Click += new System.EventHandler(btnS_Click);
		this.btnN.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnN.Location = new System.Drawing.Point(267, 87);
		this.btnN.Name = "btnN";
		this.btnN.Size = new System.Drawing.Size(48, 41);
		this.btnN.TabIndex = 553;
		this.btnN.Tag = "7";
		this.btnN.Text = "N";
		this.btnN.UseVisualStyleBackColor = true;
		this.btnN.Click += new System.EventHandler(btnN_Click);
		this.btnR.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnR.Location = new System.Drawing.Point(213, 87);
		this.btnR.Name = "btnR";
		this.btnR.Size = new System.Drawing.Size(48, 41);
		this.btnR.TabIndex = 552;
		this.btnR.Tag = "6";
		this.btnR.Text = "R";
		this.btnR.UseVisualStyleBackColor = true;
		this.btnR.Click += new System.EventHandler(btnR_Click);
		this.Parking.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Parking.Location = new System.Drawing.Point(51, 87);
		this.Parking.Name = "Parking";
		this.Parking.Size = new System.Drawing.Size(48, 41);
		this.Parking.TabIndex = 558;
		this.Parking.Tag = "3";
		this.Parking.Text = "P";
		this.Parking.UseVisualStyleBackColor = true;
		this.Parking.Click += new System.EventHandler(Parking_Click);
		this.StopGearLevel.AutoSize = true;
		this.StopGearLevel.BackColor = System.Drawing.Color.Transparent;
		this.StopGearLevel.Cursor = System.Windows.Forms.Cursors.Hand;
		this.StopGearLevel.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopGearLevel.Location = new System.Drawing.Point(136, 60);
		this.StopGearLevel.Name = "StopGearLevel";
		this.StopGearLevel.Size = new System.Drawing.Size(203, 24);
		this.StopGearLevel.TabIndex = 559;
		this.StopGearLevel.Text = "Gear Lever Positions";
		this.StopGearLevel.Click += new System.EventHandler(StopGearLevel_Click);
		this.Clear.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Clear.Location = new System.Drawing.Point(20, 575);
		this.Clear.Name = "Clear";
		this.Clear.Size = new System.Drawing.Size(122, 26);
		this.Clear.TabIndex = 560;
		this.Clear.Tag = "3";
		this.Clear.Text = "Clear:";
		this.Clear.UseVisualStyleBackColor = true;
		this.Clear.Click += new System.EventHandler(Clear_Click);
		this.TestCLUTCH.AutoSize = true;
		this.TestCLUTCH.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f);
		this.TestCLUTCH.Location = new System.Drawing.Point(268, 28);
		this.TestCLUTCH.Name = "TestCLUTCH";
		this.TestCLUTCH.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.TestCLUTCH.Size = new System.Drawing.Size(188, 30);
		this.TestCLUTCH.TabIndex = 561;
		this.TestCLUTCH.Tag = "2";
		this.TestCLUTCH.Text = "CLUTCH ACTUATOR TEST";
		this.TestCLUTCH.Click += new System.EventHandler(TestCLUTCH_Click);
		this.GetDataMemory.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.GetDataMemory.Location = new System.Drawing.Point(148, 575);
		this.GetDataMemory.Name = "GetDataMemory";
		this.GetDataMemory.Size = new System.Drawing.Size(122, 26);
		this.GetDataMemory.TabIndex = 562;
		this.GetDataMemory.Tag = "3";
		this.GetDataMemory.Text = "Get Data Memory";
		this.GetDataMemory.UseVisualStyleBackColor = true;
		this.GetDataMemory.Click += new System.EventHandler(GetDataMemory_Click);
		this.Gear.Controls.Add(this.btnS);
		this.Gear.Controls.Add(this.TestGEARBOX);
		this.Gear.Controls.Add(this.TestCLUTCH);
		this.Gear.Controls.Add(this.btnR);
		this.Gear.Controls.Add(this.btnN);
		this.Gear.Controls.Add(this.StopGearLevel);
		this.Gear.Controls.Add(this.btnD);
		this.Gear.Controls.Add(this.Parking);
		this.Gear.Controls.Add(this.btnUP);
		this.Gear.Controls.Add(this.btnDown);
		this.Gear.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Gear.Location = new System.Drawing.Point(264, 275);
		this.Gear.Name = "Gear";
		this.Gear.Size = new System.Drawing.Size(474, 137);
		this.Gear.TabIndex = 563;
		this.Gear.TabStop = false;
		this.Gear.Text = "Gear";
		this.ResetMemory.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.ResetMemory.Location = new System.Drawing.Point(599, 575);
		this.ResetMemory.Name = "ResetMemory";
		this.ResetMemory.Size = new System.Drawing.Size(116, 26);
		this.ResetMemory.TabIndex = 564;
		this.ResetMemory.Tag = "3";
		this.ResetMemory.Text = "Reset Memory";
		this.ResetMemory.UseVisualStyleBackColor = true;
		this.ResetMemory.Click += new System.EventHandler(ResetMemory_Click);
		this.Stato.AutoSize = true;
		this.Stato.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Stato.Location = new System.Drawing.Point(354, 580);
		this.Stato.Name = "Stato";
		this.Stato.Size = new System.Drawing.Size(43, 16);
		this.Stato.TabIndex = 565;
		this.Stato.Text = "Stato";
		this.Alfa4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa4.Location = new System.Drawing.Point(619, 536);
		this.Alfa4.Name = "Alfa4";
		this.Alfa4.Size = new System.Drawing.Size(66, 20);
		this.Alfa4.TabIndex = 578;
		this.Alfa4.Tag = "4";
		this.Alfa4.Text = "1";
		this.Alfa4.KeyUp += new System.Windows.Forms.KeyEventHandler(Alfa_KeyUp);
		this.label23.AutoSize = true;
		this.label23.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label23.Location = new System.Drawing.Point(556, 536);
		this.label23.Name = "label23";
		this.label23.Size = new System.Drawing.Size(56, 20);
		this.label23.TabIndex = 579;
		this.label23.Text = "Alfa4:";
		this.Alfa3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa3.Location = new System.Drawing.Point(451, 536);
		this.Alfa3.Name = "Alfa3";
		this.Alfa3.Size = new System.Drawing.Size(66, 20);
		this.Alfa3.TabIndex = 576;
		this.Alfa3.Tag = "3";
		this.Alfa3.Text = "1";
		this.Alfa3.KeyUp += new System.Windows.Forms.KeyEventHandler(Alfa_KeyUp);
		this.label24.AutoSize = true;
		this.label24.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label24.Location = new System.Drawing.Point(389, 536);
		this.label24.Name = "label24";
		this.label24.Size = new System.Drawing.Size(56, 20);
		this.label24.TabIndex = 577;
		this.label24.Text = "Alfa3:";
		this.Alfa2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa2.Location = new System.Drawing.Point(284, 536);
		this.Alfa2.Name = "Alfa2";
		this.Alfa2.Size = new System.Drawing.Size(66, 20);
		this.Alfa2.TabIndex = 574;
		this.Alfa2.Tag = "2";
		this.Alfa2.Text = "1";
		this.Alfa2.KeyUp += new System.Windows.Forms.KeyEventHandler(Alfa_KeyUp);
		this.label25.AutoSize = true;
		this.label25.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label25.Location = new System.Drawing.Point(222, 536);
		this.label25.Name = "label25";
		this.label25.Size = new System.Drawing.Size(56, 20);
		this.label25.TabIndex = 575;
		this.label25.Text = "Alfa2:";
		this.Alfa1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa1.Location = new System.Drawing.Point(117, 536);
		this.Alfa1.Name = "Alfa1";
		this.Alfa1.Size = new System.Drawing.Size(66, 20);
		this.Alfa1.TabIndex = 572;
		this.Alfa1.Tag = "1";
		this.Alfa1.Text = "1";
		this.Alfa1.KeyUp += new System.Windows.Forms.KeyEventHandler(Alfa_KeyUp);
		this.label26.AutoSize = true;
		this.label26.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label26.Location = new System.Drawing.Point(55, 536);
		this.label26.Name = "label26";
		this.label26.Size = new System.Drawing.Size(56, 20);
		this.label26.TabIndex = 573;
		this.label26.Text = "Alfa1:";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(741, 1028);
		base.Controls.Add(this.Alfa4);
		base.Controls.Add(this.label23);
		base.Controls.Add(this.Alfa3);
		base.Controls.Add(this.label24);
		base.Controls.Add(this.Alfa2);
		base.Controls.Add(this.label25);
		base.Controls.Add(this.Alfa1);
		base.Controls.Add(this.label26);
		base.Controls.Add(this.Stato);
		base.Controls.Add(this.ResetMemory);
		base.Controls.Add(this.Gear);
		base.Controls.Add(this.GetDataMemory);
		base.Controls.Add(this.Clear);
		base.Controls.Add(this.Wheel4);
		base.Controls.Add(this.Wheel3);
		base.Controls.Add(this.Wheel2);
		base.Controls.Add(this.Wheel1);
		base.Controls.Add(this.SignalIN);
		base.Controls.Add(this.SignalOUT);
		base.Controls.Add(this.Report);
		base.Controls.Add(this.StartCAN);
		base.Controls.Add(this.Sensor);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "WorkinigProgress";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Test Centralina ver1.0.0";
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(WorkinigProgress_FormClosing);
		base.Load += new System.EventHandler(WorkinigProgress_Load);
		this.Sensor.ResumeLayout(false);
		this.Sensor.PerformLayout();
		((System.ComponentModel.ISupportInitialize)this.Frequenza).EndInit();
		this.SignalOUT.ResumeLayout(false);
		this.SignalOUT.PerformLayout();
		this.SignalIN.ResumeLayout(false);
		this.SignalIN.PerformLayout();
		this.StartCAN.ResumeLayout(false);
		this.StartCAN.PerformLayout();
		this.Wheel1.ResumeLayout(false);
		this.Wheel1.PerformLayout();
		this.Wheel4.ResumeLayout(false);
		this.Wheel4.PerformLayout();
		this.Wheel3.ResumeLayout(false);
		this.Wheel3.PerformLayout();
		this.Wheel2.ResumeLayout(false);
		this.Wheel2.PerformLayout();
		this.Gear.ResumeLayout(false);
		this.Gear.PerformLayout();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
