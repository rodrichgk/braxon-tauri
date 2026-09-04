using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ElectronikSistem;

namespace SC_F2_EVO;

public class FormWashing : Form
{
	private const byte NUMBERVALVES = 12;

	public static bool CheckData;

	public static bool GetData;

	private bool ErrorCom = false;

	private bool IsNew = false;

	private byte SubCode = byte.MaxValue;

	private FormReport Terminal;

	private SelectABSForm ABSForm;

	private List<ParametriCiclo> Cycles;

	private ParametriLavaggio Parameters = null;

	private Queue<string> BufferTX;

	private Progress Progressione;

	private DataTable Cicli;

	private DataTable Valvole;

	private DataTable TestPressioni;

	private DataTable Nomi;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private JavaScriptSerializer Serializer = new JavaScriptSerializer();

	private int Index = 0;

	private int RowIndex = -1;

	private int RowID = -1;

	private string StringaConnessione;

	private string SubCodeText;

	private IContainer components = null;

	private DataGridView List;

	private Label label5;

	private ComboBox Nome;

	private Button Duplica;

	private Button Clear;

	private Button btnTerminal;

	private Button Invia;

	private Button Chiudi;

	private Button Salva;

	private Timer TimeOut;

	public Timer Send;

	private Button StartStop;

	private DataGridViewTextBoxColumn ID;

	private DataGridViewCheckBoxColumn Pompa;

	private DataGridViewCheckBoxColumn Motore;

	private DataGridViewTextBoxColumn Pressione;

	private DataGridViewTextBoxColumn Impulso;

	private DataGridViewTextBoxColumn Impulsi;

	private DataGridViewComboBoxColumn V1;

	private DataGridViewComboBoxColumn V2;

	private DataGridViewComboBoxColumn V3;

	private DataGridViewComboBoxColumn V4;

	private DataGridViewComboBoxColumn V5;

	private DataGridViewComboBoxColumn V6;

	private DataGridViewComboBoxColumn V7;

	private DataGridViewComboBoxColumn V8;

	private DataGridViewComboBoxColumn V9;

	private DataGridViewComboBoxColumn V10;

	private DataGridViewComboBoxColumn V11;

	private DataGridViewComboBoxColumn V12;

	private DataGridViewComboBoxColumn V13;

	private DataGridViewComboBoxColumn V14;

	private DataGridViewComboBoxColumn V15;

	private DataGridViewComboBoxColumn V16;

	private Label label14;

	private TextBox CodiceABS;

	private TextBox txtSubCode;

	private Label label19;

	private Button Firmware;

	public FormWashing()
	{
		InitializeComponent();
		Cycles = new List<ParametriCiclo>();
		BufferTX = new Queue<string>();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		List.AutoGenerateColumns = false;
		List.Columns["Pressione"].HeaderCell.Style.Font = new Font("Microsoft Sans Serif", 8.75f, FontStyle.Bold);
		CreaValvole();
		CreaTestPressioni();
		Cicli = new DataTable();
		Cicli.TableName = "Cicli";
		Cicli.Columns.Add("ID", typeof(byte));
		Cicli.PrimaryKey = new DataColumn[1] { Cicli.Columns["ID"] };
		Cicli.Columns["ID"].Unique = true;
		Cicli.Columns.Add("V1", typeof(sbyte));
		Cicli.Columns.Add("V2", typeof(sbyte));
		Cicli.Columns.Add("V3", typeof(sbyte));
		Cicli.Columns.Add("V4", typeof(sbyte));
		Cicli.Columns.Add("V5", typeof(sbyte));
		Cicli.Columns.Add("V6", typeof(sbyte));
		Cicli.Columns.Add("V7", typeof(sbyte));
		Cicli.Columns.Add("V8", typeof(sbyte));
		Cicli.Columns.Add("V9", typeof(sbyte));
		Cicli.Columns.Add("V10", typeof(sbyte));
		Cicli.Columns.Add("V11", typeof(sbyte));
		Cicli.Columns.Add("V12", typeof(sbyte));
		Cicli.Columns.Add("V13", typeof(sbyte));
		Cicli.Columns.Add("V14", typeof(sbyte));
		Cicli.Columns.Add("V15", typeof(sbyte));
		Cicli.Columns.Add("V16", typeof(sbyte));
		Cicli.Columns.Add("CP", typeof(bool));
		Cicli.Columns.Add("Pressione", typeof(short));
		Cicli.Columns.Add("Pausa", typeof(short));
		Cicli.Columns.Add("Impulsi", typeof(uint));
		Cicli.Columns.Add("Pompa", typeof(bool));
		Cicli.Columns.Add("Motore", typeof(bool));
		Cicli.Columns["ID"].DefaultValue = 0;
		Cicli.Columns["V1"].DefaultValue = -1;
		Cicli.Columns["V2"].DefaultValue = -1;
		Cicli.Columns["V3"].DefaultValue = -1;
		Cicli.Columns["V4"].DefaultValue = -1;
		Cicli.Columns["V5"].DefaultValue = -1;
		Cicli.Columns["V6"].DefaultValue = -1;
		Cicli.Columns["V7"].DefaultValue = -1;
		Cicli.Columns["V8"].DefaultValue = -1;
		Cicli.Columns["V9"].DefaultValue = -1;
		Cicli.Columns["V10"].DefaultValue = -1;
		Cicli.Columns["V11"].DefaultValue = -1;
		Cicli.Columns["V12"].DefaultValue = -1;
		Cicli.Columns["V13"].DefaultValue = -1;
		Cicli.Columns["V14"].DefaultValue = -1;
		Cicli.Columns["V15"].DefaultValue = -1;
		Cicli.Columns["V16"].DefaultValue = -1;
		Cicli.Columns["CP"].DefaultValue = true;
		Cicli.Columns["Pressione"].DefaultValue = 390;
		Cicli.Columns["Pausa"].DefaultValue = 100;
		Cicli.Columns["Impulsi"].DefaultValue = 5;
		Cicli.Columns["Pompa"].DefaultValue = true;
		Cicli.Columns["Motore"].DefaultValue = true;
		Cicli.RowDeleted += Cicli_RowDeleted;
		Nomi = new DataTable();
		FillNomi();
		CreaTable();
	}

	private void FormWashing_Load(object sender, EventArgs e)
	{
		if (!MainMenuForm.User)
		{
			foreach (Control control in base.Controls)
			{
				control.Visible = false;
			}
			StartStop.Height *= 2;
			base.Width = StartStop.Width + 200;
			base.Height = StartStop.Height + 200;
			StartStop.Left = (base.Width - StartStop.Width) / 2 - 10;
			StartStop.Top = (base.Height - StartStop.Height) / 2 - 30;
			StartStop.Visible = true;
			base.Left = (SystemInformation.WorkingArea.Width - base.Width) / 2;
			base.Top = (SystemInformation.WorkingArea.Height - base.Height) / 2;
		}
		Send.Start();
		BufferTX.Enqueue("W-GETMODEL");
	}

	public void Handle_DataReceived(sbyte n)
	{
		char c = '\0';
		string text = "";
		while (MainMenuForm.BufferRx[n].Count > 0)
		{
			c = MainMenuForm.BufferRx[n].Dequeue();
			MainMenuForm.DataUart[n] += c;
			TimeOut.Stop();
			Send.Stop();
			if (c == '\n')
			{
				object obj = "";
				string text2 = MainMenuForm.DataUart[n].Replace("\r\n", "");
				text = text2.Split(':')[0];
				if (text2.Split(':').Length > 1)
				{
					obj = text2.Split(':')[1].Trim();
				}
				if (text.IndexOf("Ciclo") == 0)
				{
					text = "Ciclo";
				}
				switch (text)
				{
				case "END":
					StartStop.Text = "Start";
					MessageBox.Show("Cycle completed.", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
					break;
				case "WASHING":
					BufferTX.Enqueue("ACK WASHING");
					break;
				case "OK":
					if (BufferTX.Count > 0)
					{
						BufferTX.Dequeue();
					}
					if (Progressione != null)
					{
						if (BufferTX.Count() == 0)
						{
							GetData = true;
							Progressione.Status.Value = 0;
							Progressione.Status.Maximum = 5 + Cycles.Count * 8;
						}
						else
						{
							Progressione.Status.Value = Progressione.Status.Maximum - BufferTX.Count() + 1;
						}
					}
					break;
				case "Model":
					if (Nome.SelectedValue == null)
					{
						SelectModel(obj.ToString());
						if (!MainMenuForm.User)
						{
							Invia_Click(null, null);
						}
					}
					break;
				case "ModelABS":
					if (Parameters != null)
					{
						CheckData &= obj.ToString() == Parameters.Model;
						Progressione.Status.Value = 1;
					}
					break;
				case "Pressione Lavoro":
					CheckData &= short.Parse(obj.ToString()) == Parameters.P_Work;
					Progressione.Status.Value++;
					break;
				case "Pausa test 4":
					CheckData &= short.Parse(obj.ToString()) == Parameters.Pulse4;
					Progressione.Status.Value++;
					break;
				case "Pausa test 5":
					CheckData &= short.Parse(obj.ToString()) == Parameters.Pulse5;
					Progressione.Status.Value++;
					break;
				case "Code ABS":
					CheckData &= short.Parse(obj.ToString()) == Parameters.CodiceABS;
					Progressione.Status.Value++;
					break;
				case "Ciclo":
				{
					string s = text2.Replace(":", "").Substring(5);
					Index = int.Parse(s) - 1;
					Progressione.Status.Value++;
					break;
				}
				case "Controllo pressioni":
				{
					bool flag = obj.ToString() == "SI";
					CheckData &= Cycles[Index].C == flag;
					Progressione.Status.Value++;
					break;
				}
				case "Pressione":
					CheckData &= short.Parse(obj.ToString()) == Cycles[Index].P;
					Progressione.Status.Value++;
					break;
				case "Impulso":
					CheckData &= short.Parse(obj.ToString()) == Cycles[Index].m;
					Progressione.Status.Value++;
					break;
				case "NPulses":
					CheckData &= uint.Parse(obj.ToString()) == Cycles[Index].NPulses;
					Progressione.Status.Value++;
					break;
				case "Pompa":
				{
					bool flag = obj.ToString() == "ON";
					CheckData &= Cycles[Index].Pompa == flag;
					Progressione.Status.Value++;
					break;
				}
				case "Motore":
				{
					bool flag = obj.ToString() == "ON";
					CheckData &= Cycles[Index].Motore == flag;
					Progressione.Status.Value++;
					break;
				}
				case "Valvole Ciclo":
				{
					string[] array = obj.ToString().Replace(" ", "").Split('V');
					for (int i = 1; i < array.Length; i++)
					{
						CheckData &= Cycles[Index].V[i - 1] == sbyte.Parse(array[i]);
					}
					Progressione.Status.Value++;
					break;
				}
				case "ABS caricato.":
					TimeOut.Enabled = false;
					if (!CheckData || Progressione.Status.Maximum != Progressione.Status.Value)
					{
						foreach (Control control3 in base.Controls)
						{
							control3.Enabled = true;
						}
						MessageBox.Show("Error: ABS data incorrect!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
					}
					Progressione.Close();
					Progressione.Dispose();
					Progressione = null;
					foreach (Control control4 in base.Controls)
					{
						control4.Enabled = true;
					}
					break;
				}
				if (SystemInformation.ComputerName == "PCARTURO" && GetData && !CheckData)
				{
					throw new Exception(text);
				}
				AddReport(MainMenuForm.DataUart[n]);
				MainMenuForm.DataUart[n] = "";
			}
			if (text != "ABS caricato.")
			{
				TimeOut.Start();
			}
		}
		Send.Start();
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

	private void SelectModel(string data)
	{
		short result;
		if (data.IndexOf("NONE") > -1)
		{
			MessageBox.Show("Warning: ABS not connected!!!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
		else if (SubCode == byte.MaxValue && short.TryParse(data.Split(';')[1], out result))
		{
			ABSForm = new SelectABSForm(result, type: false);
			if (ABSForm.IsGruppo)
			{
				ABSForm.ShowDialog();
			}
			SubCode = ABSForm.SubCode;
			ABSForm.Dispose();
			ABSForm = null;
			Command.Connection.Open();
			Command.CommandText = "SELECT ID FROM ABS WHERE CodiceABS = " + result + " AND SubCode = " + SubCode;
			object obj = Command.ExecuteScalar();
			Command.Connection.Close();
			if (obj != null)
			{
				Nome.SelectedValue = obj;
			}
			else
			{
				MessageBox.Show("Error: ABS not found!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			}
		}
	}

	private void CreaTable()
	{
		V1.DataPropertyName = Cicli.Columns["V1"].ColumnName;
		V2.DataPropertyName = Cicli.Columns["V2"].ColumnName;
		V3.DataPropertyName = Cicli.Columns["V3"].ColumnName;
		V4.DataPropertyName = Cicli.Columns["V4"].ColumnName;
		V5.DataPropertyName = Cicli.Columns["V5"].ColumnName;
		V6.DataPropertyName = Cicli.Columns["V6"].ColumnName;
		V7.DataPropertyName = Cicli.Columns["V7"].ColumnName;
		V8.DataPropertyName = Cicli.Columns["V8"].ColumnName;
		V9.DataPropertyName = Cicli.Columns["V9"].ColumnName;
		V10.DataPropertyName = Cicli.Columns["V10"].ColumnName;
		V11.DataPropertyName = Cicli.Columns["V11"].ColumnName;
		V12.DataPropertyName = Cicli.Columns["V12"].ColumnName;
		V13.DataPropertyName = Cicli.Columns["V13"].ColumnName;
		V14.DataPropertyName = Cicli.Columns["V14"].ColumnName;
		V15.DataPropertyName = Cicli.Columns["V15"].ColumnName;
		V16.DataPropertyName = Cicli.Columns["V16"].ColumnName;
		V1.DataSource = Valvole;
		V2.DataSource = Valvole;
		V3.DataSource = Valvole;
		V4.DataSource = Valvole;
		V5.DataSource = Valvole;
		V6.DataSource = Valvole;
		V7.DataSource = Valvole;
		V8.DataSource = Valvole;
		V9.DataSource = Valvole;
		V10.DataSource = Valvole;
		V11.DataSource = Valvole;
		V12.DataSource = Valvole;
		V13.DataSource = Valvole;
		V14.DataSource = Valvole;
		V15.DataSource = Valvole;
		V16.DataSource = Valvole;
		V1.DisplayMember = "Text";
		V2.DisplayMember = "Text";
		V3.DisplayMember = "Text";
		V4.DisplayMember = "Text";
		V5.DisplayMember = "Text";
		V6.DisplayMember = "Text";
		V7.DisplayMember = "Text";
		V8.DisplayMember = "Text";
		V9.DisplayMember = "Text";
		V10.DisplayMember = "Text";
		V11.DisplayMember = "Text";
		V12.DisplayMember = "Text";
		V13.DisplayMember = "Text";
		V14.DisplayMember = "Text";
		V15.DisplayMember = "Text";
		V16.DisplayMember = "Text";
		V1.ValueMember = "V";
		V2.ValueMember = "V";
		V3.ValueMember = "V";
		V4.ValueMember = "V";
		V5.ValueMember = "V";
		V6.ValueMember = "V";
		V7.ValueMember = "V";
		V8.ValueMember = "V";
		V9.ValueMember = "V";
		V10.ValueMember = "V";
		V11.ValueMember = "V";
		V12.ValueMember = "V";
		V13.ValueMember = "V";
		V14.ValueMember = "V";
		V15.ValueMember = "V";
		V16.ValueMember = "V";
		foreach (DataGridViewColumn column in List.Columns)
		{
			column.SortMode = DataGridViewColumnSortMode.NotSortable;
		}
	}

	private void CreaValvole()
	{
		Valvole = new DataTable();
		Valvole.TableName = "Valvole";
		Valvole.Columns.Add("ID", typeof(byte));
		Valvole.PrimaryKey = new DataColumn[1] { Valvole.Columns["ID"] };
		Valvole.Columns["ID"].Unique = true;
		Valvole.Columns["ID"].AutoIncrement = true;
		Valvole.Columns.Add("V", typeof(sbyte));
		Valvole.Columns.Add("Text", typeof(string));
		Valvole.Rows.Add(1, (sbyte)(-1), "---");
		Valvole.Rows.Add(2, (sbyte)1, "V1");
		Valvole.Rows.Add(3, (sbyte)2, "V2");
		Valvole.Rows.Add(4, (sbyte)3, "V3");
		Valvole.Rows.Add(5, (sbyte)4, "V4");
		Valvole.Rows.Add(6, (sbyte)5, "V5");
		Valvole.Rows.Add(7, (sbyte)6, "V6");
		Valvole.Rows.Add(8, (sbyte)7, "V7");
		Valvole.Rows.Add(9, (sbyte)8, "V8");
		Valvole.Rows.Add(10, (sbyte)9, "V9");
		Valvole.Rows.Add(11, (sbyte)10, "V10");
		Valvole.Rows.Add(12, (sbyte)11, "V11");
		Valvole.Rows.Add(13, (sbyte)12, "V12");
		Valvole.Rows.Add(14, (sbyte)13, "V13");
		Valvole.Rows.Add(15, (sbyte)14, "V14");
		Valvole.Rows.Add(16, (sbyte)15, "V15");
		Valvole.Rows.Add(17, (sbyte)16, "V16");
	}

	private void Nome_SelectedIndexChanged(object sender, EventArgs e)
	{
		if (!(Nome.SelectedValue is int))
		{
			return;
		}
		List.RowsAdded -= List_RowsAdded;
		DataTable dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT * FROM ABS WHERE ID = " + Nome.SelectedValue;
		Adapter.Fill(dataTable);
		DataRow dataRow = dataTable.Rows[0];
		if (Parameters == null)
		{
			Parameters = new ParametriLavaggio();
		}
		Parameters.Model = dataRow["Nome"].ToString();
		Parameters.P_Work = (short)dataRow["PressioneLavoro"];
		Parameters.Pulse4 = (short)dataRow["Pulse4"];
		Parameters.Pulse5 = (short)dataRow["Pulse5"];
		Parameters.CodiceABS = (short)dataRow["CodiceABS"];
		SubCodeText = dataRow["SubCode"].ToString();
		CodiceABS.Text = Parameters.CodiceABS.ToString();
		Cicli.Clear();
		Adapter.SelectCommand.CommandText = "SELECT Ciclo AS ID, Pressione, Impulso AS Pausa,\r\n                                                    IIf(ValvoleLavaggi.V1<128, ValvoleLavaggi.V1, -1) AS V1,\r\n                                                    IIf(ValvoleLavaggi.V2<128, ValvoleLavaggi.V2, -1) AS V2,\r\n                                                    IIf(ValvoleLavaggi.V3<128, ValvoleLavaggi.V3, -1) AS V3,\r\n                                                    IIf(ValvoleLavaggi.V4<128, ValvoleLavaggi.V4, -1) AS V4,\r\n                                                    IIf(ValvoleLavaggi.V5<128, ValvoleLavaggi.V5, -1) AS V5,\r\n                                                    IIf(ValvoleLavaggi.V6<128, ValvoleLavaggi.V6, -1) AS V6,\r\n                                                    IIf(ValvoleLavaggi.V7<128, ValvoleLavaggi.V7, -1) AS V7,\r\n                                                    IIf(ValvoleLavaggi.V8<128, ValvoleLavaggi.V8, -1) AS V8,\r\n                                                    IIf(ValvoleLavaggi.V9<128, ValvoleLavaggi.V9, -1) AS V9,\r\n                                                    IIf(ValvoleLavaggi.V10<128, ValvoleLavaggi.V10, -1) AS V10,\r\n                                                    IIf(ValvoleLavaggi.V11<128, ValvoleLavaggi.V11, -1) AS V11,\r\n                                                    IIf(ValvoleLavaggi.V12<128, ValvoleLavaggi.V12, -1) AS V12,\r\n                                                    IIf(ValvoleLavaggi.V13<128, ValvoleLavaggi.V13, -1) AS V13,\r\n                                                    IIf(ValvoleLavaggi.V14<128, ValvoleLavaggi.V14, -1) AS V14,\r\n                                                    IIf(ValvoleLavaggi.V15<128, ValvoleLavaggi.V15, -1) AS V15,\r\n                                                    IIf(ValvoleLavaggi.V16<128, ValvoleLavaggi.V16, -1) AS V16,\r\n                                                    CP, Impulsi, Pompa, Motore\r\n                                                FROM Lavaggi INNER JOIN ValvoleLavaggi ON Lavaggi.ID = ValvoleLavaggi.ID_Lavaggi\r\n                                                WHERE ID_ABS = " + Nome.SelectedValue?.ToString() + " ORDER BY Lavaggi.Ciclo";
		Adapter.Fill(Cicli);
		if (List.DataSource == null)
		{
			try
			{
				List.DataMember = Cicli.TableName;
				List.DataSource = Cicli;
			}
			catch
			{
				List.DataSource = null;
				List.DataMember = "";
			}
		}
		foreach (DataRow row in Cicli.Rows)
		{
			row.AcceptChanges();
		}
		List.RowsAdded += List_RowsAdded;
	}

	private void Salva_Click(object sender, EventArgs e)
	{
		string text = "";
		try
		{
			Command.Connection.Open();
			byte b = 0;
			string message;
			foreach (DataRow row in Cicli.Rows)
			{
				if (row.RowState == DataRowState.Deleted)
				{
					continue;
				}
				if (b < (byte)row["ID"])
				{
					b = (byte)row["ID"];
				}
				Command.CommandText = "SELECT ID FROM Lavaggi WHERE ID_ABS = " + Nome.SelectedValue?.ToString() + " AND Ciclo = " + row["ID"];
				object obj = Command.ExecuteScalar();
				if (obj == null)
				{
					text = "INSERT INTO Lavaggi ([ID_ABS], [Ciclo], [CP], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore]) VALUES (";
					text = text + Nome.SelectedValue?.ToString() + ",";
					text = text + row["ID"]?.ToString() + ",";
					text = text + row["CP"]?.ToString() + ",";
					text = text + row["Pressione"]?.ToString() + ",";
					text = text + row["Pausa"]?.ToString() + ",";
					text = text + row["Impulsi"]?.ToString() + ",";
					text = text + row["Pompa"]?.ToString() + ",";
					text += row["Motore"];
					text += ")";
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					Command.CommandText = "SELECT MAX(ID) FROM Lavaggi";
					int num = (int)Command.ExecuteScalar();
					text = "INSERT INTO ValvoleLavaggi ([ID_Lavaggi], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16]) VALUES (";
					text += num;
					for (byte b2 = 1; b2 <= 16; b2++)
					{
						text = text + "," + row["V" + b2];
					}
					text += ")";
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
				}
				else
				{
					text = "UPDATE Lavaggi SET ";
					text = text + "CP = " + row["CP"]?.ToString() + ", ";
					text = text + "Pressione = " + row["Pressione"]?.ToString() + ", ";
					text = text + "Impulso = " + row["Pausa"]?.ToString() + ", ";
					text = text + "Impulsi = " + row["Impulsi"]?.ToString() + ", ";
					text = text + "Pompa = " + row["Pompa"]?.ToString() + ", ";
					text = text + "Motore = " + row["Motore"];
					text = text + " WHERE ID_ABS = " + Nome.SelectedValue?.ToString() + " AND Ciclo = " + row["ID"];
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					Command.CommandText = "SELECT ID FROM Lavaggi WHERE ID_ABS = " + Nome.SelectedValue?.ToString() + " AND Ciclo = " + row["ID"];
					obj = Command.ExecuteScalar();
					if (obj == null)
					{
						obj = null;
					}
					Command.CommandText = "SELECT ID FROM ValvoleLavaggi WHERE ID_Lavaggi = " + obj;
					int num2 = (int)Command.ExecuteScalar();
					text = "UPDATE ValvoleLavaggi SET ";
					text = text + "[V1] = " + row["V1"]?.ToString() + ",";
					text = text + "[V2] = " + row["V2"]?.ToString() + ",";
					text = text + "[V3] = " + row["V3"]?.ToString() + ",";
					text = text + "[V4] = " + row["V4"]?.ToString() + ",";
					text = text + "[V5] = " + row["V5"]?.ToString() + ",";
					text = text + "[V6] = " + row["V6"]?.ToString() + ",";
					text = text + "[V7] = " + row["V7"]?.ToString() + ",";
					text = text + "[V8] = " + row["V8"]?.ToString() + ",";
					text = text + "[V9] = " + row["V9"]?.ToString() + ",";
					text = text + "[V10] = " + row["V10"]?.ToString() + ",";
					text = text + "[V11] = " + row["V11"]?.ToString() + ",";
					text = text + "[V12] = " + row["V12"]?.ToString() + ",";
					text = text + "[V13] = " + row["V13"]?.ToString() + ",";
					text = text + "[V14] = " + row["V14"]?.ToString() + ",";
					text = text + "[V15] = " + row["V15"]?.ToString() + ",";
					text = text + "[V16] = " + row["V16"];
					text = text + " WHERE ID = " + num2;
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
				}
				row.AcceptChanges();
			}
			text = "DELETE FROM Lavaggi WHERE ID_ABS = " + Nome.SelectedValue?.ToString() + " AND Ciclo > " + b;
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			Command.Connection.Close();
			MessageBox.Show("Salvataggio completato.", "Informazione", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
		}
		catch (Exception ex)
		{
			MessageBox.Show("Errore: " + ex.Message, "Errore", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void List_DataError(object sender, DataGridViewDataErrorEventArgs e)
	{
	}

	private void Chiudi_Click(object sender, EventArgs e)
	{
		Close();
	}

	private void FormWashing_FormClosing(object sender, FormClosingEventArgs e)
	{
	}

	private void CreaTestPressioni()
	{
		TestPressioni = new DataTable();
		TestPressioni.TableName = "TestPressioni";
		TestPressioni.Columns.Add("ID", typeof(byte));
		TestPressioni.PrimaryKey = new DataColumn[1] { TestPressioni.Columns["ID"] };
		TestPressioni.Columns["ID"].Unique = true;
		TestPressioni.Columns["ID"].AutoIncrement = true;
		TestPressioni.Columns.Add("V", typeof(bool));
		TestPressioni.Columns.Add("Text", typeof(string));
		TestPressioni.Rows.Add(0, false, "NO");
		TestPressioni.Rows.Add(1, true, "SI");
	}

	private void Invia_Click(object sender, EventArgs e)
	{
		Send.Stop();
		List.CommitEdit(DataGridViewDataErrorContexts.Commit);
		CheckData = true;
		GetData = false;
		Progressione = new Progress();
		Progressione.TopMost = true;
		Progressione.Show();
		Cycles.Clear();
		ParametriCiclo parametriCiclo = null;
		foreach (DataRow row in Cicli.Rows)
		{
			if (row.RowState != DataRowState.Deleted)
			{
				parametriCiclo = new ParametriCiclo();
				parametriCiclo.NCiclo = (byte)row["ID"];
				parametriCiclo.C = true;
				parametriCiclo.P = (short)row["Pressione"];
				parametriCiclo.m = (short)row["Pausa"];
				parametriCiclo.NPulses = (uint)row["Impulsi"];
				parametriCiclo.Pompa = (bool)row["Pompa"];
				parametriCiclo.Motore = (bool)row["Motore"];
				for (int i = 1; i <= 16; i++)
				{
					parametriCiclo.V.Add((sbyte)row["V" + i]);
				}
				Cycles.Add(parametriCiclo);
			}
		}
		string item = Serializer.Serialize(Parameters);
		BufferTX.Enqueue(item);
		foreach (ParametriCiclo cycle in Cycles)
		{
			item = Serializer.Serialize(cycle);
			BufferTX.Enqueue(item);
		}
		Salva salva = new Salva(save: true);
		item = Serializer.Serialize(salva);
		BufferTX.Enqueue(item);
		Progressione.Status.Maximum = BufferTX.Count();
		foreach (Control control in base.Controls)
		{
			control.Enabled = false;
		}
		if (MainMenuForm.WASHINGBOARD > -1)
		{
			MainMenuForm.COM[MainMenuForm.WASHINGBOARD].DiscardInBuffer();
			MainMenuForm.COM[MainMenuForm.WASHINGBOARD].DiscardOutBuffer();
		}
		Send.Start();
	}

	private void TimeOut_Tick(object sender, EventArgs e)
	{
		TimeOut.Enabled = false;
		if (Progressione == null)
		{
			return;
		}
		if (!CheckData || Progressione.Status.Maximum != Progressione.Status.Value)
		{
			foreach (Control control in base.Controls)
			{
				control.Enabled = true;
			}
			MessageBox.Show("Error: ABS data incorrect!!!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
		if (Progressione != null)
		{
			Progressione.Close();
			Progressione.Dispose();
			Progressione = null;
		}
		if (Terminal != null)
		{
			Terminal.Close();
		}
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

	private void StartStop_Click(object sender, EventArgs e)
	{
		if (StartStop.Text == "Start")
		{
			BufferTX.Enqueue("W-CYCLE");
			StartStop.Text = "Stop";
		}
		else if (StartStop.Text == "Stop")
		{
			BufferTX.Enqueue("W-CYCLE");
			StartStop.Text = "Start";
		}
	}

	private void Duplica_Click(object sender, EventArgs e)
	{
		FormListModels formListModels = new FormListModels(1);
		if (formListModels.ShowDialog() == DialogResult.OK)
		{
			Nome.SelectedIndexChanged -= Nome_SelectedIndexChanged;
			Nome.SelectedValue = formListModels.ID_ABS;
			DataTable dataTable = new DataTable();
			OleDbCommand selectCommand = Adapter.SelectCommand;
			int iD_ABS = formListModels.ID_ABS;
			selectCommand.CommandText = "SELECT CodiceABS, SubCode FROM ABS WHERE ID = " + iD_ABS;
			Adapter.Fill(dataTable);
			CodiceABS.Text = dataTable.Rows[0]["CodiceABS"].ToString();
			txtSubCode.Text = dataTable.Rows[0]["SubCode"].ToString();
			Nome.SelectedIndexChanged += Nome_SelectedIndexChanged;
		}
	}

	private void Clear_Click(object sender, EventArgs e)
	{
		Terminal.Report.Text = "";
	}

	private void Firmware_Click(object sender, EventArgs e)
	{
		string text = "";
		List<string> list = new List<string>();
		DataTable dataTable = new DataTable();
		DataTable dataTable2 = new DataTable();
		string text2 = "C:\\Users\\Arthur\\Documents\\PlatformIO\\Projects\\WASHING Board\\src\\Data ABS1.h";
		string format = "SELECT Ciclo AS ID, Pressione, Impulso AS Pausa,\r\n                                                    IIf(ValvoleLavaggi.V1<128, ValvoleLavaggi.V1, -1) AS V1,\r\n                                                    IIf(ValvoleLavaggi.V2<128, ValvoleLavaggi.V2, -1) AS V2,\r\n                                                    IIf(ValvoleLavaggi.V3<128, ValvoleLavaggi.V3, -1) AS V3,\r\n                                                    IIf(ValvoleLavaggi.V4<128, ValvoleLavaggi.V4, -1) AS V4,\r\n                                                    IIf(ValvoleLavaggi.V5<128, ValvoleLavaggi.V5, -1) AS V5,\r\n                                                    IIf(ValvoleLavaggi.V6<128, ValvoleLavaggi.V6, -1) AS V6,\r\n                                                    IIf(ValvoleLavaggi.V7<128, ValvoleLavaggi.V7, -1) AS V7,\r\n                                                    IIf(ValvoleLavaggi.V8<128, ValvoleLavaggi.V8, -1) AS V8,\r\n                                                    IIf(ValvoleLavaggi.V9<128, ValvoleLavaggi.V9, -1) AS V9,\r\n                                                    IIf(ValvoleLavaggi.V10<128, ValvoleLavaggi.V10, -1) AS V10,\r\n                                                    IIf(ValvoleLavaggi.V11<128, ValvoleLavaggi.V11, -1) AS V11,\r\n                                                    IIf(ValvoleLavaggi.V12<128, ValvoleLavaggi.V12, -1) AS V12,\r\n                                                    IIf(ValvoleLavaggi.V13<128, ValvoleLavaggi.V13, -1) AS V13,\r\n                                                    IIf(ValvoleLavaggi.V14<128, ValvoleLavaggi.V14, -1) AS V14,\r\n                                                    IIf(ValvoleLavaggi.V15<128, ValvoleLavaggi.V15, -1) AS V15,\r\n                                                    IIf(ValvoleLavaggi.V16<128, ValvoleLavaggi.V16, -1) AS V16,\r\n                                                    CP, Impulsi, Pompa, Motore\r\n                                                FROM Lavaggi INNER JOIN ValvoleLavaggi ON Lavaggi.ID = ValvoleLavaggi.ID_Lavaggi\r\n                                                WHERE ID_ABS = {0} ORDER BY Lavaggi.Ciclo";
		int num = 0;
		int num2 = 1;
		string[] array = File.ReadAllLines(text2);
		foreach (string text3 in array)
		{
			if (text3.IndexOf("const") > -1)
			{
				list.Add(text3.Replace("_", num2.ToString()));
				text = text3;
				break;
			}
			list.Add(text3);
		}
		Adapter.SelectCommand.CommandText = "SELECT ID, CodiceABS, Nome, PressioneLavoro, Pulse4, Pulse5 FROM ABS ORDER BY CodiceABS";
		Adapter.Fill(dataTable);
		foreach (DataRow row in dataTable.Rows)
		{
			if (++num % 27 == 0)
			{
				list.Add("};\r\n");
				num2++;
				list.Add(text.Replace("_", num2.ToString()));
			}
			string text4 = "   {";
			text4 = text4 + row["CodiceABS"]?.ToString() + ",";
			text4 = text4 + "\"" + row["Nome"]?.ToString() + "\",";
			text4 = text4 + row["PressioneLavoro"]?.ToString() + ",";
			text4 = text4 + row["Pulse4"]?.ToString() + ",";
			text4 = text4 + row["Pulse5"]?.ToString() + ", {\r\n";
			Adapter.SelectCommand.CommandText = string.Format(format, row["ID"]);
			dataTable2.Clear();
			Adapter.Fill(dataTable2);
			foreach (DataRow row2 in dataTable2.Rows)
			{
				text4 += "            {";
				text4 = text4 + row2["ID"]?.ToString() + ",";
				text4 += "true,";
				text4 = text4 + row2["Pressione"]?.ToString() + ",";
				text4 = text4 + row2["Pausa"]?.ToString() + ",";
				text4 = text4 + row2["Impulsi"]?.ToString() + ",";
				text4 = text4 + row2["Pompa"].ToString().ToLower() + ",";
				text4 = text4 + row2["Motore"].ToString().ToLower() + ", {";
				for (byte b = 1; b < 17; b++)
				{
					text4 = text4 + row2["V" + b]?.ToString() + ",";
				}
				text4 += "-1}},\r\n";
			}
			text4 += "            {";
			text4 += "-1,";
			text4 += "false,";
			text4 += "0,";
			text4 += "0,";
			text4 += "0,";
			text4 += "false,";
			text4 += "false, {";
			for (byte b2 = 1; b2 < 17; b2++)
			{
				text4 += "-1,";
			}
			text4 += "-1}}\r\n";
			text4 += "      }\r\n";
			text4 += "   },";
			list.Add(text4);
		}
		list.Add("};");
		list.Add("#endif");
		text2 = text2.Replace("1", "");
		if (File.Exists(text2))
		{
			File.Delete(text2);
		}
		File.WriteAllLines(text2, list);
		MessageBox.Show("File generato.", "Inormazione", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
	}

	private void Cicli_RowDeleted(object sender, DataRowChangeEventArgs e)
	{
		byte b = 1;
		foreach (DataRow row in Cicli.Rows)
		{
			if (row.RowState != DataRowState.Deleted)
			{
				row["ID"] = b++;
			}
		}
		if (RowIndex != -1)
		{
			List.Rows[RowIndex].Selected = true;
			List.CurrentCell = List.Rows[RowIndex].Cells[0];
		}
	}

	private void List_KeyUp(object sender, KeyEventArgs e)
	{
		int rowIndex = RowIndex;
		if (e.KeyCode == Keys.Insert && RowID >= 0)
		{
			DataRow row = Cicli.NewRow();
			Cicli.Rows.InsertAt(row, rowIndex);
			List.ClearSelection();
			List.Rows[rowIndex].Selected = true;
			List.CurrentCell = List.Rows[rowIndex].Cells[0];
		}
	}

	private void List_RowHeaderMouseClick(object sender, DataGridViewCellMouseEventArgs e)
	{
		RowID = (byte)List["ID", e.RowIndex].Value;
		RowIndex = e.RowIndex;
	}

	private void List_CellClick(object sender, DataGridViewCellEventArgs e)
	{
		List.BeginEdit(selectAll: true);
		if (List.EditingControl is DataGridViewComboBoxEditingControl)
		{
			ComboBox comboBox = (ComboBox)List.EditingControl;
			comboBox.DroppedDown = true;
		}
	}

	private void List_RowsAdded(object sender, DataGridViewRowsAddedEventArgs e)
	{
		byte b = 100;
		for (int i = 0; i < List.Rows.Count; i++)
		{
			List["ID", i].Value = b++;
		}
		List.BindingContext[List.DataSource].EndCurrentEdit();
		List.CurrentRow.DataGridView.EndEdit();
		List.EndEdit();
		List.CommitEdit(DataGridViewDataErrorContexts.Commit);
		b = 1;
		for (int j = 0; j < List.Rows.Count; j++)
		{
			List["ID", j].Value = b++;
		}
		List.Rows[RowIndex].Selected = true;
		List.CurrentCell = List.Rows[RowIndex].Cells[0];
	}

	private void Send_Tick(object sender, EventArgs e)
	{
		try
		{
			if (BufferTX.Count <= 0)
			{
				return;
			}
			string text = BufferTX.Peek();
			if (MainMenuForm.WASHINGBOARD != -1)
			{
				if (!MainMenuForm.COM[MainMenuForm.WASHINGBOARD].IsOpen)
				{
					MainMenuForm.COM[MainMenuForm.WASHINGBOARD].Open();
				}
				MainMenuForm.COM[MainMenuForm.WASHINGBOARD].WriteLine(text);
			}
		}
		catch (IOException)
		{
			if (MainMenuForm.WASHINGBOARD > -1)
			{
				ErrorCom = true;
			}
		}
		catch (InvalidOperationException)
		{
			if (MainMenuForm.WASHINGBOARD > -1)
			{
				ErrorCom = true;
			}
		}
		catch (UnauthorizedAccessException)
		{
			if (MainMenuForm.WASHINGBOARD > -1)
			{
				ErrorCom = true;
			}
		}
	}

	protected void FillNomi()
	{
		Nomi.Clear();
		Adapter.SelectCommand.CommandText = "SELECT ID, Nome FROM ABS ORDER BY Nome";
		Adapter.Fill(Nomi);
		if (IsNew || Nomi.Rows.Count == 0)
		{
			Nome.DropDownStyle = ComboBoxStyle.Simple;
			if (IsNew)
			{
			}
			IsNew = true;
		}
		else
		{
			Nome.DropDownStyle = ComboBoxStyle.DropDownList;
			Nome.DataSource = Nomi;
			Nome.DisplayMember = "Nome";
			Nome.ValueMember = "ID";
			Nome.SelectedIndex = -1;
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
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle3 = new System.Windows.Forms.DataGridViewCellStyle();
		this.List = new System.Windows.Forms.DataGridView();
		this.ID = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Pompa = new System.Windows.Forms.DataGridViewCheckBoxColumn();
		this.Motore = new System.Windows.Forms.DataGridViewCheckBoxColumn();
		this.Pressione = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Impulso = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Impulsi = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.V1 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V2 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V3 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V4 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V5 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V6 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V7 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V8 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V9 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V10 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V11 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V12 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V13 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V14 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V15 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.V16 = new System.Windows.Forms.DataGridViewComboBoxColumn();
		this.label5 = new System.Windows.Forms.Label();
		this.Nome = new System.Windows.Forms.ComboBox();
		this.Duplica = new System.Windows.Forms.Button();
		this.Clear = new System.Windows.Forms.Button();
		this.btnTerminal = new System.Windows.Forms.Button();
		this.Invia = new System.Windows.Forms.Button();
		this.Chiudi = new System.Windows.Forms.Button();
		this.Salva = new System.Windows.Forms.Button();
		this.TimeOut = new System.Windows.Forms.Timer(this.components);
		this.Send = new System.Windows.Forms.Timer(this.components);
		this.StartStop = new System.Windows.Forms.Button();
		this.label14 = new System.Windows.Forms.Label();
		this.CodiceABS = new System.Windows.Forms.TextBox();
		this.txtSubCode = new System.Windows.Forms.TextBox();
		this.label19 = new System.Windows.Forms.Label();
		this.Firmware = new System.Windows.Forms.Button();
		((System.ComponentModel.ISupportInitialize)this.List).BeginInit();
		base.SuspendLayout();
		this.List.AllowUserToOrderColumns = true;
		this.List.AllowUserToResizeColumns = false;
		this.List.AllowUserToResizeRows = false;
		dataGridViewCellStyle.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		dataGridViewCellStyle.BackColor = System.Drawing.SystemColors.Control;
		dataGridViewCellStyle.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle.ForeColor = System.Drawing.SystemColors.WindowText;
		dataGridViewCellStyle.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
		this.List.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle;
		this.List.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
		this.List.Columns.AddRange(this.ID, this.Pompa, this.Motore, this.Pressione, this.Impulso, this.Impulsi, this.V1, this.V2, this.V3, this.V4, this.V5, this.V6, this.V7, this.V8, this.V9, this.V10, this.V11, this.V12, this.V13, this.V14, this.V15, this.V16);
		dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
		dataGridViewCellStyle2.BackColor = System.Drawing.SystemColors.Window;
		dataGridViewCellStyle2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle2.ForeColor = System.Drawing.SystemColors.ControlText;
		dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.False;
		this.List.DefaultCellStyle = dataGridViewCellStyle2;
		this.List.Location = new System.Drawing.Point(10, 51);
		this.List.Name = "List";
		this.List.Size = new System.Drawing.Size(1221, 451);
		this.List.TabIndex = 30;
		this.List.CellClick += new System.Windows.Forms.DataGridViewCellEventHandler(List_CellClick);
		this.List.DataError += new System.Windows.Forms.DataGridViewDataErrorEventHandler(List_DataError);
		this.List.RowHeaderMouseClick += new System.Windows.Forms.DataGridViewCellMouseEventHandler(List_RowHeaderMouseClick);
		this.List.RowsAdded += new System.Windows.Forms.DataGridViewRowsAddedEventHandler(List_RowsAdded);
		this.List.KeyUp += new System.Windows.Forms.KeyEventHandler(List_KeyUp);
		this.ID.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.ID.DataPropertyName = "ID";
		dataGridViewCellStyle3.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		this.ID.DefaultCellStyle = dataGridViewCellStyle3;
		this.ID.HeaderText = "N°";
		this.ID.Name = "ID";
		this.ID.ReadOnly = true;
		this.ID.Width = 55;
		this.Pompa.DataPropertyName = "Pompa";
		this.Pompa.HeaderText = "Pompa";
		this.Pompa.Name = "Pompa";
		this.Pompa.Width = 70;
		this.Motore.DataPropertyName = "Motore";
		this.Motore.HeaderText = "Motore";
		this.Motore.Name = "Motore";
		this.Motore.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.Motore.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.Motore.Visible = false;
		this.Motore.Width = 70;
		this.Pressione.DataPropertyName = "Pressione";
		this.Pressione.HeaderText = "Pressione Massima Ciclo";
		this.Pressione.Name = "Pressione";
		this.Pressione.Width = 75;
		this.Impulso.DataPropertyName = "Pausa";
		this.Impulso.HeaderText = "Impulso";
		this.Impulso.Name = "Impulso";
		this.Impulso.Width = 80;
		this.Impulsi.DataPropertyName = "Impulsi";
		this.Impulsi.HeaderText = "Impulsi";
		this.Impulsi.Name = "Impulsi";
		this.Impulsi.Width = 80;
		this.V1.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V1.HeaderText = "1";
		this.V1.Name = "V1";
		this.V1.Width = 39;
		this.V2.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V2.HeaderText = "2";
		this.V2.Name = "V2";
		this.V2.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V2.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V2.Width = 45;
		this.V3.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V3.HeaderText = "3";
		this.V3.Name = "V3";
		this.V3.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V3.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V3.Width = 45;
		this.V4.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V4.HeaderText = "4";
		this.V4.Name = "V4";
		this.V4.Width = 39;
		this.V5.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V5.HeaderText = "5";
		this.V5.Name = "V5";
		this.V5.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V5.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V5.Width = 45;
		this.V6.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V6.HeaderText = "6";
		this.V6.Name = "V6";
		this.V6.Width = 39;
		this.V7.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V7.HeaderText = "7";
		this.V7.Name = "V7";
		this.V7.Width = 39;
		this.V8.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V8.HeaderText = "8";
		this.V8.Name = "V8";
		this.V8.Width = 39;
		this.V9.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V9.HeaderText = "9";
		this.V9.Name = "V9";
		this.V9.Width = 39;
		this.V10.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V10.HeaderText = "10";
		this.V10.Name = "V10";
		this.V10.Width = 39;
		this.V11.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V11.HeaderText = "11";
		this.V11.Name = "V11";
		this.V11.Width = 39;
		this.V12.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V12.HeaderText = "12";
		this.V12.Name = "V12";
		this.V12.Width = 39;
		this.V13.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V13.HeaderText = "13";
		this.V13.Name = "V13";
		this.V13.Width = 39;
		this.V14.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V14.HeaderText = "14";
		this.V14.Name = "V14";
		this.V14.Width = 39;
		this.V15.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V15.HeaderText = "15";
		this.V15.Name = "V15";
		this.V15.Width = 39;
		this.V16.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V16.HeaderText = "16";
		this.V16.Name = "V16";
		this.V16.Width = 39;
		this.label5.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label5.AutoSize = true;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.Location = new System.Drawing.Point(12, 17);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(60, 20);
		this.label5.TabIndex = 44;
		this.label5.Text = "Nome:";
		this.Nome.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Nome.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Nome.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Nome.Location = new System.Drawing.Point(78, 17);
		this.Nome.Name = "Nome";
		this.Nome.Size = new System.Drawing.Size(241, 24);
		this.Nome.TabIndex = 43;
		this.Nome.SelectedIndexChanged += new System.EventHandler(Nome_SelectedIndexChanged);
		this.Duplica.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Duplica.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Duplica.Location = new System.Drawing.Point(589, 546);
		this.Duplica.Name = "Duplica";
		this.Duplica.Size = new System.Drawing.Size(95, 35);
		this.Duplica.TabIndex = 63;
		this.Duplica.Text = "Duplica";
		this.Duplica.UseVisualStyleBackColor = true;
		this.Duplica.Click += new System.EventHandler(Duplica_Click);
		this.Clear.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Clear.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Clear.Location = new System.Drawing.Point(375, 546);
		this.Clear.Name = "Clear";
		this.Clear.Size = new System.Drawing.Size(137, 35);
		this.Clear.TabIndex = 62;
		this.Clear.Text = "Clear Report";
		this.Clear.UseVisualStyleBackColor = true;
		this.Clear.Click += new System.EventHandler(Clear_Click);
		this.btnTerminal.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.btnTerminal.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnTerminal.Location = new System.Drawing.Point(203, 546);
		this.btnTerminal.Name = "btnTerminal";
		this.btnTerminal.Size = new System.Drawing.Size(95, 35);
		this.btnTerminal.TabIndex = 61;
		this.btnTerminal.Text = "Terminal";
		this.btnTerminal.UseVisualStyleBackColor = true;
		this.btnTerminal.Click += new System.EventHandler(btnTerminal_Click);
		this.Invia.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Invia.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Invia.Location = new System.Drawing.Point(933, 546);
		this.Invia.Name = "Invia";
		this.Invia.Size = new System.Drawing.Size(95, 35);
		this.Invia.TabIndex = 60;
		this.Invia.Text = "Invia";
		this.Invia.UseVisualStyleBackColor = true;
		this.Invia.Click += new System.EventHandler(Invia_Click);
		this.Chiudi.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Chiudi.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Chiudi.Location = new System.Drawing.Point(1105, 546);
		this.Chiudi.Name = "Chiudi";
		this.Chiudi.Size = new System.Drawing.Size(95, 35);
		this.Chiudi.TabIndex = 59;
		this.Chiudi.Text = "Chiudi";
		this.Chiudi.UseVisualStyleBackColor = true;
		this.Chiudi.Click += new System.EventHandler(Chiudi_Click);
		this.Salva.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Salva.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Salva.Location = new System.Drawing.Point(31, 546);
		this.Salva.Name = "Salva";
		this.Salva.Size = new System.Drawing.Size(95, 35);
		this.Salva.TabIndex = 58;
		this.Salva.Text = "Salva";
		this.Salva.UseVisualStyleBackColor = true;
		this.Salva.Click += new System.EventHandler(Salva_Click);
		this.TimeOut.Interval = 15000;
		this.TimeOut.Tick += new System.EventHandler(TimeOut_Tick);
		this.Send.Interval = 200;
		this.Send.Tick += new System.EventHandler(Send_Tick);
		this.StartStop.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right;
		this.StartStop.Cursor = System.Windows.Forms.Cursors.Hand;
		this.StartStop.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StartStop.Location = new System.Drawing.Point(345, 6);
		this.StartStop.Name = "StartStop";
		this.StartStop.Size = new System.Drawing.Size(137, 42);
		this.StartStop.TabIndex = 64;
		this.StartStop.Text = "Start";
		this.StartStop.UseVisualStyleBackColor = true;
		this.StartStop.Click += new System.EventHandler(StartStop_Click);
		this.label14.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label14.AutoSize = true;
		this.label14.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label14.Location = new System.Drawing.Point(521, 17);
		this.label14.Name = "label14";
		this.label14.Size = new System.Drawing.Size(110, 20);
		this.label14.TabIndex = 71;
		this.label14.Text = "Codice ABS:";
		this.CodiceABS.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.CodiceABS.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.CodiceABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.CodiceABS.Location = new System.Drawing.Point(644, 17);
		this.CodiceABS.Name = "CodiceABS";
		this.CodiceABS.ReadOnly = true;
		this.CodiceABS.Size = new System.Drawing.Size(45, 22);
		this.CodiceABS.TabIndex = 70;
		this.CodiceABS.Text = "0";
		this.CodiceABS.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.txtSubCode.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.txtSubCode.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.txtSubCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.txtSubCode.Location = new System.Drawing.Point(810, 17);
		this.txtSubCode.Name = "txtSubCode";
		this.txtSubCode.ReadOnly = true;
		this.txtSubCode.Size = new System.Drawing.Size(24, 22);
		this.txtSubCode.TabIndex = 69;
		this.txtSubCode.Text = "0";
		this.txtSubCode.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
		this.label19.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label19.AutoSize = true;
		this.label19.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label19.Location = new System.Drawing.Point(711, 17);
		this.label19.Name = "label19";
		this.label19.Size = new System.Drawing.Size(93, 20);
		this.label19.TabIndex = 68;
		this.label19.Text = "Sub Code:";
		this.Firmware.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Firmware.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Firmware.Location = new System.Drawing.Point(761, 546);
		this.Firmware.Name = "Firmware";
		this.Firmware.Size = new System.Drawing.Size(95, 35);
		this.Firmware.TabIndex = 72;
		this.Firmware.Text = "Firmware";
		this.Firmware.UseVisualStyleBackColor = true;
		this.Firmware.Click += new System.EventHandler(Firmware_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1237, 583);
		base.Controls.Add(this.Firmware);
		base.Controls.Add(this.label14);
		base.Controls.Add(this.CodiceABS);
		base.Controls.Add(this.txtSubCode);
		base.Controls.Add(this.label19);
		base.Controls.Add(this.StartStop);
		base.Controls.Add(this.Duplica);
		base.Controls.Add(this.Clear);
		base.Controls.Add(this.btnTerminal);
		base.Controls.Add(this.Invia);
		base.Controls.Add(this.Chiudi);
		base.Controls.Add(this.Salva);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.Nome);
		base.Controls.Add(this.List);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormWashing";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Washing";
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(FormWashing_FormClosing);
		base.Load += new System.EventHandler(FormWashing_Load);
		((System.ComponentModel.ISupportInitialize)this.List).EndInit();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
