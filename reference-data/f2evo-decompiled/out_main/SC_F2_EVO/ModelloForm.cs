using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class ModelloForm : Form
{
	private bool Start = false;

	private int ID_Produttore;

	private int ID;

	private DataTable Stringhe;

	private List<FRAMEROW> Comando = new List<FRAMEROW>();

	private Progress ProgressBar;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private IContainer components = null;

	private Button Salva;

	private Button Annulla;

	private Label label18;

	private TextBox Modello;

	private Button Elimina;

	private ComboBox SpeedCAN;

	private Label label19;

	private DataGridView Strings;

	private Label label1;

	private RadioButton Active;

	private RadioButton Passive;

	private Label label2;

	private ComboBox Signal;

	private Label label5;

	private ComboBox SelectString;

	private Button Import;

	private OpenFileDialog ImportFile;

	private Label label3;

	private Label label4;

	private TextBox Wheel1Res1;

	private TextBox Wheel1Res2;

	private TextBox Code;

	private Label label6;

	private TextBox Percentuale;

	private Label label8;

	private TextBox Pausa;

	private Label label9;

	private CheckBox WaitComunication;

	private CheckBox EnableMotor;

	private CheckBox EnableValves;

	private CheckBox Spike;

	private GroupBox Wheel1;

	private GroupBox Wheel2;

	private TextBox Wheel2Res1;

	private Label label10;

	private TextBox Wheel2Res2;

	private Label label11;

	private GroupBox Wheel3;

	private TextBox Wheel3Res1;

	private Label label12;

	private TextBox Wheel3Res2;

	private Label label13;

	private GroupBox Wheel4;

	private TextBox Wheel4Res1;

	private Label label14;

	private TextBox Wheel4Res2;

	private Label label15;

	private TextBox Coefficient;

	private Label label7;

	private TextBox Delta;

	private Label label16;

	private CheckBox Copia;

	private Button Duplica;

	private CheckBox EnableFilter;

	private TextBox Speed1;

	private Label label17;

	private TextBox Speed2;

	private Label label20;

	private TextBox Speed3;

	private Label label21;

	private TextBox Speed4;

	private Label label22;

	private DataGridViewTextBoxColumn MPos;

	private DataGridViewTextBoxColumn TypeField;

	private DataGridViewTextBoxColumn MAddress1;

	private DataGridViewTextBoxColumn DelayField;

	private DataGridViewTextBoxColumn MD1;

	private DataGridViewTextBoxColumn MD2;

	private DataGridViewTextBoxColumn MD3;

	private DataGridViewTextBoxColumn MD4;

	private DataGridViewTextBoxColumn MD5;

	private DataGridViewTextBoxColumn MD6;

	private DataGridViewTextBoxColumn MD7;

	private DataGridViewTextBoxColumn MD8;

	private TextBox Alfa4;

	private Label label23;

	private TextBox Alfa3;

	private Label label24;

	private TextBox Alfa2;

	private Label label25;

	private TextBox Alfa1;

	private Label label26;

	public ModelloForm(int idproduttore, int id, string nome)
	{
		InitializeComponent();
		if (SelectModelForm.TypeComponent == 0)
		{
			SelectString.Items.AddRange(new object[4] { "ABS Enable", "Motor Test", "Valve Test", "Start ABS" });
		}
		else
		{
			SelectString.Items.AddRange(new object[11]
			{
				"GEARBOX Enable", "GEARBOX ACTUATOR Test", "CLUTCH ACTUATOR Test", "Parking", "Position -", "Position +", "Position R", "Position N", "Position D", "Position S",
				"ENGINE"
			});
		}
		Stringhe = new DataTable();
		Stringhe.TableNewRow += Motor_TableNewRow;
		base.DialogResult = DialogResult.Cancel;
		ID = id;
		ID_Produttore = idproduttore;
		Modello.Text = nome;
		Elimina.Enabled = id != -1;
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		adapter = new OleDbDataAdapter(Command);
		Command.CommandText = "SELECT * FROM Modelli WHERE ID = " + id;
		if (id > -1)
		{
			DataTable dataTable = new DataTable();
			adapter.Fill(dataTable);
			SpeedCAN.SelectedIndex = int.Parse(dataTable.Rows[0]["SpeedCAN"].ToString());
			Active.Checked = bool.Parse(dataTable.Rows[0]["Type"].ToString());
			Signal.SelectedIndex = sbyte.Parse(dataTable.Rows[0]["Signal"].ToString());
			Wheel1Res1.Text = dataTable.Rows[0]["Wheel1Res1"].ToString();
			Wheel1Res2.Text = dataTable.Rows[0]["Wheel1Res2"].ToString();
			Wheel2Res1.Text = dataTable.Rows[0]["Wheel2Res1"].ToString();
			Wheel2Res2.Text = dataTable.Rows[0]["Wheel2Res2"].ToString();
			Wheel3Res1.Text = dataTable.Rows[0]["Wheel3Res1"].ToString();
			Wheel3Res2.Text = dataTable.Rows[0]["Wheel3Res2"].ToString();
			Wheel4Res1.Text = dataTable.Rows[0]["Wheel4Res1"].ToString();
			Wheel4Res2.Text = dataTable.Rows[0]["Wheel4Res2"].ToString();
			if (Wheel2Res1.Text == "")
			{
				Wheel2Res1.Text = Wheel1Res1.Text;
				Wheel2Res2.Text = Wheel1Res2.Text;
				Wheel3Res1.Text = Wheel1Res1.Text;
				Wheel3Res2.Text = Wheel1Res2.Text;
				Wheel4Res1.Text = Wheel1Res1.Text;
				Wheel4Res2.Text = Wheel1Res2.Text;
			}
			if (dataTable.Rows[0]["Coefficient"] != DBNull.Value)
			{
				Coefficient.Text = ((double)dataTable.Rows[0]["Coefficient"]).ToString("###0.000");
			}
			if (dataTable.Rows[0]["DeltaSpeed"] != DBNull.Value)
			{
				Delta.Text = ((double)dataTable.Rows[0]["DeltaSpeed"]).ToString("###0.000");
			}
			else
			{
				Delta.Text = "1.0";
			}
			Code.Text = dataTable.Rows[0]["Code"].ToString();
			Percentuale.Text = dataTable.Rows[0]["BreakSpeed"].ToString();
			Pausa.Text = dataTable.Rows[0]["Pausa"].ToString();
			WaitComunication.Checked = bool.Parse(dataTable.Rows[0]["WaitComunication"].ToString());
			Spike.Checked = bool.Parse(dataTable.Rows[0]["Spike"].ToString());
			EnableMotor.Checked = ((byte)dataTable.Rows[0]["Enable"] & 1) > 0;
			EnableValves.Checked = ((byte)dataTable.Rows[0]["Enable"] & 2) > 0;
			Speed1.Text = ((dataTable.Rows[0]["Speed1"] != DBNull.Value) ? dataTable.Rows[0]["Speed1"].ToString() : "0");
			Speed2.Text = ((dataTable.Rows[0]["Speed2"] != DBNull.Value) ? dataTable.Rows[0]["Speed2"].ToString() : "0");
			Speed3.Text = ((dataTable.Rows[0]["Speed3"] != DBNull.Value) ? dataTable.Rows[0]["Speed3"].ToString() : "0");
			Speed4.Text = ((dataTable.Rows[0]["Speed4"] != DBNull.Value) ? dataTable.Rows[0]["Speed4"].ToString() : "0");
			Alfa1.Text = dataTable.Rows[0]["Alfa1"].ToString();
			Alfa2.Text = dataTable.Rows[0]["Alfa2"].ToString();
			Alfa3.Text = dataTable.Rows[0]["Alfa3"].ToString();
			Alfa4.Text = dataTable.Rows[0]["Alfa4"].ToString();
		}
		else
		{
			SpeedCAN.SelectedIndex = -1;
			if (SelectModelForm.TypeComponent == 0)
			{
				Passive.Checked = true;
			}
			else
			{
				Active.Checked = true;
			}
			Signal.SelectedIndex = 0;
		}
		base.DialogResult = DialogResult.Cancel;
	}

	private void ModelloForm_Load(object sender, EventArgs e)
	{
		SelectString.SelectedIndex = 0;
	}

	private void SelectString_SelectedIndexChanged(object sender, EventArgs e)
	{
		Stringhe.Clear();
		TableFill(SelectString.SelectedIndex);
	}

	private void TableFill(int test)
	{
		Strings.AutoGenerateColumns = false;
		Stringhe = new DataTable();
		Command.CommandText = "SELECT * FROM Stringhe WHERE ID_Modello = " + ID + " AND Test = " + SelectString.SelectedIndex + " ORDER BY [Order]";
		adapter.Fill(Stringhe);
		Strings.DataSource = Stringhe;
	}

	private void ModelloForm_Activated(object sender, EventArgs e)
	{
		if (Start)
		{
			Modello.Focus();
		}
		Start = false;
	}

	private void Modello_Validating(object sender, CancelEventArgs e)
	{
		bool flag = Modello.Focused | Annulla.Focused;
		if (!Elimina.Focused && !Annulla.Focused && Modello.Text.Trim() == "")
		{
			MessageBox.Show("Invalid value.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			e.Cancel = true;
		}
	}

	private void Annulla_Click(object sender, EventArgs e)
	{
		Close();
	}

	protected void InsStringhe(int id)
	{
		string text = "";
		try
		{
			if (Command.Connection.State != ConnectionState.Open)
			{
				Command.Connection.Open();
			}
			foreach (FRAMEROW item in Comando)
			{
				text = "INSERT INTO Stringhe ([ID_Modello], [Order], [Test], [Type], [Address1], [Delay]";
				if (item.data.Count > 0)
				{
					text += ",";
				}
				byte b;
				for (b = 1; b < item.data.Count; b++)
				{
					text = text + "[D" + b + "], ";
				}
				if (item.data.Count > 0)
				{
					text = text + "[D" + b + "]";
				}
				text += ") VALUES (";
				text = text + id + ", ";
				string obj = text;
				short pos = item.pos;
				text = obj + pos + ", ";
				string obj2 = text;
				byte test = item.Test;
				text = obj2 + test + ", ";
				string obj3 = text;
				test = item.type;
				text = obj3 + test + ", ";
				string obj4 = text;
				uint address = item.address1;
				text = obj4 + address + ", ";
				string obj5 = text;
				pos = item.us;
				text = obj5 + pos;
				if (item.data.Count > 0)
				{
					text += ",";
				}
				for (b = 0; b < item.data.Count - 1; b++)
				{
					text = text + item.data[b] + ", ";
				}
				if (item.data.Count > 0)
				{
					text += item.data[b];
				}
				text += ");";
				Command.CommandText = text;
				Command.ExecuteNonQuery();
				ProgressBar.Status.Value++;
				Application.DoEvents();
			}
		}
		finally
		{
			Command.Connection.Close();
		}
		ProgressBar.Close();
		ProgressBar = null;
		Comando.Clear();
	}

	public string GetValue(string strSQL)
	{
		object obj = null;
		Command.CommandText = strSQL;
		obj = Command.ExecuteScalar();
		if (obj == null || obj.ToString() == "")
		{
			obj = "-1";
		}
		return obj.ToString();
	}

	private string CheckFields()
	{
		string result = null;
		if (!double.TryParse(Alfa1.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var result2))
		{
			result = "Valore Alfa1 non valido.";
		}
		if (!double.TryParse(Alfa2.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore Alfa2 non valido.";
		}
		if (!double.TryParse(Alfa3.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore Alfa3 non valido.";
		}
		if (!double.TryParse(Alfa4.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore Alfa4 non valido.";
		}
		if (!uint.TryParse(Speed1.Text, out var result3))
		{
			result = "Valore Speed1 non valido.";
		}
		if (!uint.TryParse(Speed2.Text, out result3))
		{
			result = "Valore Speed2 non valido.";
		}
		if (!uint.TryParse(Speed3.Text, out result3))
		{
			result = "Valore Speed3 non valido.";
		}
		if (!uint.TryParse(Speed4.Text, out result3))
		{
			result = "Valore Speed4 non valido.";
		}
		if (!uint.TryParse(Wheel1Res2.Text, out result3))
		{
			result = "Valore Wheel1 Res 2 non valido.";
		}
		if (!uint.TryParse(Wheel1Res1.Text, out result3))
		{
			result = "Valore Wheel1 Res 1 non valido.";
		}
		if (!uint.TryParse(Wheel2Res2.Text, out result3))
		{
			result = "Valore Wheel2 Res 2 non valido.";
		}
		if (!uint.TryParse(Wheel2Res1.Text, out result3))
		{
			result = "Valore Wheel2 Res 1 non valido.";
		}
		if (!uint.TryParse(Wheel3Res2.Text, out result3))
		{
			result = "Valore Wheel3 Res 2 non valido.";
		}
		if (!uint.TryParse(Wheel3Res1.Text, out result3))
		{
			result = "Valore Wheel3 Res 1 non valido.";
		}
		if (!uint.TryParse(Wheel4Res2.Text, out result3))
		{
			result = "Valore Wheel4 Res 2 non valido.";
		}
		if (!uint.TryParse(Wheel4Res1.Text, out result3))
		{
			result = "Valore Wheel4 Res 1 non valido.";
		}
		if (!uint.TryParse(Code.Text, out result3))
		{
			result = "Valore codice non valido.";
		}
		if (!uint.TryParse(Pausa.Text, out result3))
		{
			result = "Valore pausa non valido.";
		}
		if (!double.TryParse(Coefficient.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore Alfa non valido.";
		}
		if (!double.TryParse(Delta.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore Delta non valido.";
		}
		if (!double.TryParse(Percentuale.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out result2))
		{
			result = "Valore percentuale non valido.";
		}
		return result;
	}

	private void Salva_Click(object sender, EventArgs e)
	{
		string text = CheckFields();
		if (text != null)
		{
			MessageBox.Show("Warning: " + text, "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			return;
		}
		if (SpeedCAN.SelectedIndex == -1)
		{
			MessageBox.Show("Select speed CAN.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			return;
		}
		try
		{
			byte b = (byte)(Convert.ToByte(EnableMotor.Checked) + 2 * Convert.ToByte(EnableValves.Checked));
			if (Command.Connection.State != ConnectionState.Open)
			{
				Command.Connection.Open();
			}
			if (ID > 0)
			{
				Command.CommandText = "UPDATE Modelli SET ";
				OleDbCommand command = Command;
				command.CommandText = command.CommandText + "[Nome] = '" + Modello.Text + "', ";
				OleDbCommand command2 = Command;
				command2.CommandText = command2.CommandText + "SpeedCAN = " + SpeedCAN.SelectedIndex + ", ";
				OleDbCommand command3 = Command;
				command3.CommandText = command3.CommandText + "Type = " + Active.Checked + ", ";
				OleDbCommand command4 = Command;
				command4.CommandText = command4.CommandText + "Signal = " + Signal.SelectedIndex + ", ";
				OleDbCommand command5 = Command;
				command5.CommandText = command5.CommandText + "Wheel1Res1 = " + Wheel1Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command6 = Command;
				command6.CommandText = command6.CommandText + "Wheel1Res2 = " + Wheel1Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command7 = Command;
				command7.CommandText = command7.CommandText + "Wheel2Res1 = " + Wheel2Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command8 = Command;
				command8.CommandText = command8.CommandText + "Wheel2Res2 = " + Wheel2Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command9 = Command;
				command9.CommandText = command9.CommandText + "Wheel3Res1 = " + Wheel3Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command10 = Command;
				command10.CommandText = command10.CommandText + "Wheel3Res2 = " + Wheel3Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command11 = Command;
				command11.CommandText = command11.CommandText + "Wheel4Res1 = " + Wheel4Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command12 = Command;
				command12.CommandText = command12.CommandText + "Wheel4Res2 = " + Wheel4Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command13 = Command;
				command13.CommandText = command13.CommandText + "Code = " + Code.Text.Replace(",", ".") + ", ";
				OleDbCommand command14 = Command;
				command14.CommandText = command14.CommandText + "Coefficient = " + Coefficient.Text.Replace(",", ".") + ", ";
				OleDbCommand command15 = Command;
				command15.CommandText = command15.CommandText + "DeltaSpeed = " + Delta.Text.Replace(",", ".") + ", ";
				OleDbCommand command16 = Command;
				command16.CommandText = command16.CommandText + "BreakSpeed = " + Percentuale.Text.Replace(",", ".") + ", ";
				OleDbCommand command17 = Command;
				command17.CommandText = command17.CommandText + "Pausa = " + Pausa.Text.Replace(",", ".") + ", ";
				OleDbCommand command18 = Command;
				command18.CommandText = command18.CommandText + "Component = " + SelectModelForm.TypeComponent + ", ";
				OleDbCommand command19 = Command;
				command19.CommandText = command19.CommandText + "WaitComunication = " + WaitComunication.Checked + ", ";
				OleDbCommand command20 = Command;
				command20.CommandText = command20.CommandText + "[Enable] = " + b + ", ";
				OleDbCommand command21 = Command;
				command21.CommandText = command21.CommandText + "[Spike] = " + Spike.Checked + ", ";
				OleDbCommand command22 = Command;
				command22.CommandText = command22.CommandText + "Speed1 = " + Speed1.Text.Replace(",", ".") + ", ";
				OleDbCommand command23 = Command;
				command23.CommandText = command23.CommandText + "Speed2 = " + Speed2.Text.Replace(",", ".") + ", ";
				OleDbCommand command24 = Command;
				command24.CommandText = command24.CommandText + "Speed3 = " + Speed3.Text.Replace(",", ".") + ", ";
				OleDbCommand command25 = Command;
				command25.CommandText = command25.CommandText + "Speed4 = " + Speed4.Text.Replace(",", ".") + ", ";
				OleDbCommand command26 = Command;
				command26.CommandText = command26.CommandText + "Alfa1 = " + Alfa1.Text.Replace(",", ".") + ", ";
				OleDbCommand command27 = Command;
				command27.CommandText = command27.CommandText + "Alfa2 = " + Alfa2.Text.Replace(",", ".") + ", ";
				OleDbCommand command28 = Command;
				command28.CommandText = command28.CommandText + "Alfa3 = " + Alfa3.Text.Replace(",", ".") + ", ";
				OleDbCommand command29 = Command;
				command29.CommandText = command29.CommandText + "Alfa4 = " + Alfa4.Text.Replace(",", ".");
				OleDbCommand command30 = Command;
				command30.CommandText = command30.CommandText + " WHERE ID = " + ID;
				Command.ExecuteNonQuery();
				Command.CommandText = "DELETE * FROM Stringhe WHERE ID_Modello = " + ID + " AND Test = " + SelectString.SelectedIndex;
				Command.ExecuteNonQuery();
			}
			else
			{
				Command.CommandText = "INSERT INTO Modelli ([ID_Produttore], [Nome], [SpeedCAN], [Type], [Signal], [Wheel1Res1], [Wheel1Res2], [Wheel2Res1], [Wheel2Res2], [Wheel3Res1], [Wheel3Res2], [Wheel4Res1], [Wheel4Res2], [Code], [Coefficient], [DeltaSpeed], [BreakSpeed], [Pausa], [Component], [WaitComunication], [Enable], [Spike], [Speed1], [Speed2], [Speed3], [Speed4], [Alfa1], [Alfa2], [Alfa3], [Alfa4]) VALUES (";
				OleDbCommand command31 = Command;
				command31.CommandText = command31.CommandText + ID_Produttore + ", ";
				OleDbCommand command32 = Command;
				command32.CommandText = command32.CommandText + "'" + Modello.Text + "', ";
				OleDbCommand command33 = Command;
				command33.CommandText = command33.CommandText + SpeedCAN.SelectedIndex + ", ";
				OleDbCommand command34 = Command;
				command34.CommandText = command34.CommandText + Active.Checked + ", ";
				OleDbCommand command35 = Command;
				command35.CommandText = command35.CommandText + Signal.SelectedIndex + ", ";
				OleDbCommand command36 = Command;
				command36.CommandText = command36.CommandText + Wheel1Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command37 = Command;
				command37.CommandText = command37.CommandText + Wheel1Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command38 = Command;
				command38.CommandText = command38.CommandText + Wheel2Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command39 = Command;
				command39.CommandText = command39.CommandText + Wheel2Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command40 = Command;
				command40.CommandText = command40.CommandText + Wheel3Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command41 = Command;
				command41.CommandText = command41.CommandText + Wheel3Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command42 = Command;
				command42.CommandText = command42.CommandText + Wheel4Res1.Text.Replace(",", ".") + ", ";
				OleDbCommand command43 = Command;
				command43.CommandText = command43.CommandText + Wheel4Res2.Text.Replace(",", ".") + ", ";
				OleDbCommand command44 = Command;
				command44.CommandText = command44.CommandText + Code.Text.Replace(",", ".") + ", ";
				OleDbCommand command45 = Command;
				command45.CommandText = command45.CommandText + Coefficient.Text.Replace(",", ".") + ", ";
				OleDbCommand command46 = Command;
				command46.CommandText = command46.CommandText + Delta.Text.Replace(",", ".") + ", ";
				OleDbCommand command47 = Command;
				command47.CommandText = command47.CommandText + Percentuale.Text.Replace(",", ".") + ", ";
				OleDbCommand command48 = Command;
				command48.CommandText = command48.CommandText + Pausa.Text.Replace(",", ".") + ", ";
				OleDbCommand command49 = Command;
				command49.CommandText = command49.CommandText + SelectModelForm.TypeComponent + ", ";
				OleDbCommand command50 = Command;
				command50.CommandText = command50.CommandText + WaitComunication.Checked + ", ";
				OleDbCommand command51 = Command;
				command51.CommandText = command51.CommandText + b + ", ";
				OleDbCommand command52 = Command;
				command52.CommandText = command52.CommandText + Spike.Checked + ", ";
				OleDbCommand command53 = Command;
				command53.CommandText = command53.CommandText + Speed1.Text.Replace(",", ".") + ", ";
				OleDbCommand command54 = Command;
				command54.CommandText = command54.CommandText + Speed2.Text.Replace(",", ".") + ", ";
				OleDbCommand command55 = Command;
				command55.CommandText = command55.CommandText + Speed3.Text.Replace(",", ".") + ", ";
				OleDbCommand command56 = Command;
				command56.CommandText = command56.CommandText + Speed4.Text.Replace(",", ".") + ", ";
				OleDbCommand command57 = Command;
				command57.CommandText = command57.CommandText + Alfa1.Text.Replace(",", ".") + ", ";
				OleDbCommand command58 = Command;
				command58.CommandText = command58.CommandText + Alfa2.Text.Replace(",", ".") + ", ";
				OleDbCommand command59 = Command;
				command59.CommandText = command59.CommandText + Alfa3.Text.Replace(",", ".") + ", ";
				Command.CommandText += Alfa4.Text.Replace(",", ".");
				Command.CommandText += ")";
				Command.ExecuteNonQuery();
				ID = int.Parse(GetValue("SELECT MAX(ID) FROM Modelli"));
			}
		}
		finally
		{
			Command.Connection.Close();
		}
		ProgressBar = new Progress();
		UpLoad(Stringhe, SelectString.SelectedIndex);
		ProgressBar.Status.Maximum = Comando.Count;
		ProgressBar.Show();
		InsStringhe(ID);
		base.DialogResult = DialogResult.OK;
		Close();
	}

	private void UpLoad(DataTable table, int test)
	{
		short num = 0;
		foreach (DataRow row in table.Rows)
		{
			FRAMEROW item = new FRAMEROW
			{
				address1 = Convert.ToUInt32(row["Address1"]),
				pos = num++,
				Test = (byte)test,
				type = (byte)row["Type"],
				us = (short)(int)row["Delay"],
				data = new List<byte>()
			};
			for (byte b = 1; b < 9; b++)
			{
				if (row["D" + b] != DBNull.Value)
				{
					item.data.Add((byte)row["D" + b]);
				}
			}
			Comando.Add(item);
		}
	}

	private void Elimina_Click(object sender, EventArgs e)
	{
		try
		{
			if (Command.Connection.State != ConnectionState.Open)
			{
				Command.Connection.Open();
			}
			if (MessageBox.Show("Are you sure you want to delete this model?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
			{
				Command.CommandText = "DELETE * FROM Modelli WHERE ID = " + ID;
				Command.ExecuteNonQuery();
				base.DialogResult = DialogResult.OK;
				Close();
			}
		}
		finally
		{
			Command.Connection.Close();
		}
	}

	private void Table_CellValidating(object sender, DataGridViewCellValidatingEventArgs e)
	{
		DataGridView dataGridView = (DataGridView)sender;
		byte result2;
		if (Convert.ToString(e.FormattedValue) == "" || e.ColumnIndex == 0)
		{
			e.Cancel = false;
		}
		else if (e.ColumnIndex >= 1 && e.ColumnIndex <= 3)
		{
			if (!uint.TryParse(Convert.ToString(e.FormattedValue), NumberStyles.HexNumber, null, out var _))
			{
				e.Cancel = true;
				return;
			}
			dataGridView[e.ColumnIndex, e.RowIndex].Value = uint.Parse(Convert.ToString(e.FormattedValue), NumberStyles.HexNumber);
			e.Cancel = false;
		}
		else if (!byte.TryParse(Convert.ToString(e.FormattedValue), NumberStyles.HexNumber, null, out result2))
		{
			e.Cancel = true;
		}
		else
		{
			dataGridView[e.ColumnIndex, e.RowIndex].Value = byte.Parse(Convert.ToString(e.FormattedValue), NumberStyles.HexNumber);
			e.Cancel = false;
		}
	}

	private void Table_CellValidated(object sender, DataGridViewCellEventArgs e)
	{
		DataGridView dataGridView = (DataGridView)sender;
		byte result2;
		if (e.ColumnIndex >= 1 && e.ColumnIndex <= 3)
		{
			if (uint.TryParse(Strings[e.ColumnIndex, e.RowIndex].Value.ToString(), NumberStyles.HexNumber, null, out var _))
			{
				dataGridView[e.ColumnIndex, e.RowIndex].Value = uint.Parse(Strings[e.ColumnIndex, e.RowIndex].Value.ToString(), NumberStyles.HexNumber);
			}
		}
		else if (byte.TryParse(Strings[e.ColumnIndex, e.RowIndex].Value.ToString(), NumberStyles.HexNumber, null, out result2))
		{
			dataGridView[e.ColumnIndex, e.RowIndex].Value = byte.Parse(Strings[e.ColumnIndex, e.RowIndex].Value.ToString(), NumberStyles.HexNumber);
		}
	}

	private void Table_UserDeletedRow(object sender, DataGridViewRowEventArgs e)
	{
		DataGridView dataGridView = (DataGridView)sender;
		for (byte b = 0; b < Strings.RowCount; b++)
		{
			dataGridView["MPos", b].Value = b;
		}
	}

	private void Table_DataError(object sender, DataGridViewDataErrorEventArgs e)
	{
		e.Cancel = false;
	}

	private void Motor_TableNewRow(object sender, DataTableNewRowEventArgs e)
	{
		if (e.Row["Order"].ToString() == "")
		{
			e.Row["Order"] = Strings.RowCount - 1;
		}
	}

	private void Wheel1Res1_KeyUp(object sender, KeyEventArgs e)
	{
		if (Copia.Checked)
		{
			Wheel2Res1.Text = Wheel1Res1.Text;
			Wheel3Res1.Text = Wheel1Res1.Text;
			Wheel4Res1.Text = Wheel1Res1.Text;
		}
	}

	private void Wheel1Res2_KeyUp(object sender, KeyEventArgs e)
	{
		if (Copia.Checked)
		{
			Wheel2Res2.Text = Wheel1Res2.Text;
			Wheel3Res2.Text = Wheel1Res2.Text;
			Wheel4Res2.Text = Wheel1Res2.Text;
		}
	}

	private void Duplica_Click(object sender, EventArgs e)
	{
		NewProduttoreForm newProduttoreForm = new NewProduttoreForm(select: true, "il produttore");
		if (newProduttoreForm.ShowDialog() == DialogResult.OK)
		{
			ID_Produttore = (int)newProduttoreForm.Produttore.SelectedValue;
			ID = -1;
			Salva_Click(sender, e);
		}
	}

	private void Import_Click(object sender, EventArgs e)
	{
		if (ImportFile.ShowDialog() != DialogResult.OK)
		{
			return;
		}
		string[] array = File.ReadAllLines(ImportFile.FileName);
		int num = 0;
		List<string> list = new List<string>();
		Stringhe.Clear();
		ProgressBar = new Progress();
		ProgressBar.Status.Maximum = array.Length;
		ProgressBar.Show();
		double num2 = -1.0;
		for (int i = 0; i < array.Length; i++)
		{
			array[i] = array[i].Replace("\t", " ");
		}
		string[] array2 = array;
		foreach (string text in array2)
		{
			ProgressBar.Status.Value++;
			Application.DoEvents();
			if (text.IndexOf(")") <= -1 || text.IndexOf("Rx") <= -1)
			{
				continue;
			}
			string text2 = text;
			for (int k = 0; k < 10; k++)
			{
				text2 = text2.Replace("  ", " ");
			}
			string[] array3 = text2.Split(" "[0]);
			if (num2 == -1.0)
			{
				num2 = double.Parse(array3[2].Replace(".", ","));
			}
			int num3 = byte.Parse(array3[5]);
			DataRow dataRow = Stringhe.NewRow();
			dataRow["Order"] = num++;
			dataRow["Address1"] = uint.Parse(array3[4], NumberStyles.HexNumber);
			dataRow["Delay"] = (short)((double.Parse(array3[2].Replace(".", ","), MainMenuForm.Culture) - num2) * 1000.0);
			num2 = double.Parse(array3[2].Replace(".", ","), MainMenuForm.Culture);
			dataRow["Test"] = SelectString.SelectedIndex;
			dataRow["Type"] = SelectString.SelectedIndex;
			for (int l = 1; l <= num3; l++)
			{
				dataRow["D" + l] = byte.Parse(array3[5 + l], NumberStyles.HexNumber);
			}
			string text3 = "";
			for (int m = 4; m < array3.Length; m++)
			{
				text3 += array3[m];
			}
			if (EnableFilter.Checked)
			{
				if (!list.Contains(text3))
				{
					list.Add(text3);
					Stringhe.Rows.Add(dataRow);
				}
			}
			else
			{
				Stringhe.Rows.Add(dataRow);
			}
		}
		for (int n = 0; n < Stringhe.Rows.Count - 2; n++)
		{
			int num4 = (int)Stringhe.Rows[n + 1]["Delay"];
			if (num4 >= 136)
			{
				num4 -= 136;
			}
			Stringhe.Rows[n]["Delay"] = num4;
		}
		ProgressBar.Close();
		ProgressBar.Dispose();
		ProgressBar = null;
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
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle3 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle4 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle5 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle6 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle7 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle8 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle9 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle10 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle11 = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle12 = new System.Windows.Forms.DataGridViewCellStyle();
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SC_F2_EVO.ModelloForm));
		this.Salva = new System.Windows.Forms.Button();
		this.Annulla = new System.Windows.Forms.Button();
		this.label18 = new System.Windows.Forms.Label();
		this.Modello = new System.Windows.Forms.TextBox();
		this.Elimina = new System.Windows.Forms.Button();
		this.SpeedCAN = new System.Windows.Forms.ComboBox();
		this.label19 = new System.Windows.Forms.Label();
		this.Strings = new System.Windows.Forms.DataGridView();
		this.MPos = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.TypeField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MAddress1 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.DelayField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD1 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD2 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD3 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD4 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD5 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD6 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD7 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.MD8 = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.label1 = new System.Windows.Forms.Label();
		this.Active = new System.Windows.Forms.RadioButton();
		this.Passive = new System.Windows.Forms.RadioButton();
		this.label2 = new System.Windows.Forms.Label();
		this.Signal = new System.Windows.Forms.ComboBox();
		this.label5 = new System.Windows.Forms.Label();
		this.SelectString = new System.Windows.Forms.ComboBox();
		this.Import = new System.Windows.Forms.Button();
		this.ImportFile = new System.Windows.Forms.OpenFileDialog();
		this.label3 = new System.Windows.Forms.Label();
		this.label4 = new System.Windows.Forms.Label();
		this.Wheel1Res1 = new System.Windows.Forms.TextBox();
		this.Wheel1Res2 = new System.Windows.Forms.TextBox();
		this.Code = new System.Windows.Forms.TextBox();
		this.label6 = new System.Windows.Forms.Label();
		this.Percentuale = new System.Windows.Forms.TextBox();
		this.label8 = new System.Windows.Forms.Label();
		this.Pausa = new System.Windows.Forms.TextBox();
		this.label9 = new System.Windows.Forms.Label();
		this.WaitComunication = new System.Windows.Forms.CheckBox();
		this.EnableMotor = new System.Windows.Forms.CheckBox();
		this.EnableValves = new System.Windows.Forms.CheckBox();
		this.Spike = new System.Windows.Forms.CheckBox();
		this.Wheel1 = new System.Windows.Forms.GroupBox();
		this.Copia = new System.Windows.Forms.CheckBox();
		this.Wheel2 = new System.Windows.Forms.GroupBox();
		this.Wheel2Res1 = new System.Windows.Forms.TextBox();
		this.label10 = new System.Windows.Forms.Label();
		this.Wheel2Res2 = new System.Windows.Forms.TextBox();
		this.label11 = new System.Windows.Forms.Label();
		this.Wheel3 = new System.Windows.Forms.GroupBox();
		this.Wheel3Res1 = new System.Windows.Forms.TextBox();
		this.label12 = new System.Windows.Forms.Label();
		this.Wheel3Res2 = new System.Windows.Forms.TextBox();
		this.label13 = new System.Windows.Forms.Label();
		this.Wheel4 = new System.Windows.Forms.GroupBox();
		this.Wheel4Res1 = new System.Windows.Forms.TextBox();
		this.label14 = new System.Windows.Forms.Label();
		this.Wheel4Res2 = new System.Windows.Forms.TextBox();
		this.label15 = new System.Windows.Forms.Label();
		this.Coefficient = new System.Windows.Forms.TextBox();
		this.label7 = new System.Windows.Forms.Label();
		this.Delta = new System.Windows.Forms.TextBox();
		this.label16 = new System.Windows.Forms.Label();
		this.Duplica = new System.Windows.Forms.Button();
		this.EnableFilter = new System.Windows.Forms.CheckBox();
		this.Speed1 = new System.Windows.Forms.TextBox();
		this.label17 = new System.Windows.Forms.Label();
		this.Speed2 = new System.Windows.Forms.TextBox();
		this.label20 = new System.Windows.Forms.Label();
		this.Speed3 = new System.Windows.Forms.TextBox();
		this.label21 = new System.Windows.Forms.Label();
		this.Speed4 = new System.Windows.Forms.TextBox();
		this.label22 = new System.Windows.Forms.Label();
		this.Alfa4 = new System.Windows.Forms.TextBox();
		this.label23 = new System.Windows.Forms.Label();
		this.Alfa3 = new System.Windows.Forms.TextBox();
		this.label24 = new System.Windows.Forms.Label();
		this.Alfa2 = new System.Windows.Forms.TextBox();
		this.label25 = new System.Windows.Forms.Label();
		this.Alfa1 = new System.Windows.Forms.TextBox();
		this.label26 = new System.Windows.Forms.Label();
		((System.ComponentModel.ISupportInitialize)this.Strings).BeginInit();
		this.Wheel1.SuspendLayout();
		this.Wheel2.SuspendLayout();
		this.Wheel3.SuspendLayout();
		this.Wheel4.SuspendLayout();
		base.SuspendLayout();
		this.Salva.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Salva.Location = new System.Drawing.Point(12, 863);
		this.Salva.Name = "Salva";
		this.Salva.Size = new System.Drawing.Size(93, 35);
		this.Salva.TabIndex = 13;
		this.Salva.Text = "Save";
		this.Salva.UseVisualStyleBackColor = true;
		this.Salva.Click += new System.EventHandler(Salva_Click);
		this.Annulla.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Annulla.Location = new System.Drawing.Point(565, 863);
		this.Annulla.Name = "Annulla";
		this.Annulla.Size = new System.Drawing.Size(93, 35);
		this.Annulla.TabIndex = 16;
		this.Annulla.Text = "Cancel";
		this.Annulla.UseVisualStyleBackColor = true;
		this.Annulla.Click += new System.EventHandler(Annulla_Click);
		this.label18.AutoSize = true;
		this.label18.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label18.Location = new System.Drawing.Point(4, 9);
		this.label18.Name = "label18";
		this.label18.Size = new System.Drawing.Size(62, 20);
		this.label18.TabIndex = 399;
		this.label18.Text = "Model:";
		this.Modello.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Modello.Location = new System.Drawing.Point(72, 7);
		this.Modello.Name = "Modello";
		this.Modello.Size = new System.Drawing.Size(215, 22);
		this.Modello.TabIndex = 0;
		this.Modello.Validating += new System.ComponentModel.CancelEventHandler(Modello_Validating);
		this.Elimina.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Elimina.Location = new System.Drawing.Point(400, 863);
		this.Elimina.Name = "Elimina";
		this.Elimina.Size = new System.Drawing.Size(147, 35);
		this.Elimina.TabIndex = 15;
		this.Elimina.Text = "Delete Model";
		this.Elimina.UseVisualStyleBackColor = true;
		this.Elimina.Click += new System.EventHandler(Elimina_Click);
		this.SpeedCAN.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.SpeedCAN.FormattingEnabled = true;
		this.SpeedCAN.Items.AddRange(new object[3] { "500KBps", "250KBps", "50KBps" });
		this.SpeedCAN.Location = new System.Drawing.Point(550, 8);
		this.SpeedCAN.Name = "SpeedCAN";
		this.SpeedCAN.Size = new System.Drawing.Size(108, 21);
		this.SpeedCAN.TabIndex = 8;
		this.label19.AutoSize = true;
		this.label19.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label19.Location = new System.Drawing.Point(478, 9);
		this.label19.Name = "label19";
		this.label19.Size = new System.Drawing.Size(66, 20);
		this.label19.TabIndex = 403;
		this.label19.Text = "Speed:";
		this.Strings.AllowUserToOrderColumns = true;
		this.Strings.AllowUserToResizeColumns = false;
		this.Strings.AllowUserToResizeRows = false;
		dataGridViewCellStyle.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
		dataGridViewCellStyle.BackColor = System.Drawing.SystemColors.Control;
		dataGridViewCellStyle.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle.ForeColor = System.Drawing.SystemColors.WindowText;
		dataGridViewCellStyle.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
		this.Strings.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle;
		this.Strings.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
		this.Strings.Columns.AddRange(this.MPos, this.TypeField, this.MAddress1, this.DelayField, this.MD1, this.MD2, this.MD3, this.MD4, this.MD5, this.MD6, this.MD7, this.MD8);
		this.Strings.Location = new System.Drawing.Point(2, 387);
		this.Strings.Name = "Strings";
		this.Strings.Size = new System.Drawing.Size(664, 470);
		this.Strings.TabIndex = 12;
		this.Strings.CellValidated += new System.Windows.Forms.DataGridViewCellEventHandler(Table_CellValidated);
		this.Strings.CellValidating += new System.Windows.Forms.DataGridViewCellValidatingEventHandler(Table_CellValidating);
		this.Strings.DataError += new System.Windows.Forms.DataGridViewDataErrorEventHandler(Table_DataError);
		this.Strings.UserDeletedRow += new System.Windows.Forms.DataGridViewRowEventHandler(Table_UserDeletedRow);
		this.MPos.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.None;
		this.MPos.DataPropertyName = "Order";
		dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		this.MPos.DefaultCellStyle = dataGridViewCellStyle2;
		this.MPos.HeaderText = "N°";
		this.MPos.Name = "MPos";
		this.MPos.ReadOnly = true;
		this.MPos.Width = 40;
		this.TypeField.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.None;
		this.TypeField.DataPropertyName = "Type";
		dataGridViewCellStyle3.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		this.TypeField.DefaultCellStyle = dataGridViewCellStyle3;
		this.TypeField.HeaderText = "Type";
		this.TypeField.Name = "TypeField";
		this.TypeField.Width = 62;
		this.MAddress1.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.None;
		this.MAddress1.DataPropertyName = "Address1";
		dataGridViewCellStyle4.Format = "X";
		dataGridViewCellStyle4.NullValue = null;
		this.MAddress1.DefaultCellStyle = dataGridViewCellStyle4;
		this.MAddress1.HeaderText = "Address";
		this.MAddress1.Name = "MAddress1";
		this.MAddress1.Width = 85;
		this.DelayField.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.None;
		this.DelayField.DataPropertyName = "Delay";
		this.DelayField.HeaderText = "Delay (us)";
		this.DelayField.Name = "DelayField";
		this.DelayField.Width = 115;
		this.MD1.DataPropertyName = "D1";
		dataGridViewCellStyle5.Format = "X2";
		this.MD1.DefaultCellStyle = dataGridViewCellStyle5;
		this.MD1.HeaderText = "D1";
		this.MD1.Name = "MD1";
		this.MD1.Width = 37;
		this.MD2.DataPropertyName = "D2";
		dataGridViewCellStyle6.Format = "X2";
		this.MD2.DefaultCellStyle = dataGridViewCellStyle6;
		this.MD2.HeaderText = "D2";
		this.MD2.Name = "MD2";
		this.MD2.Width = 37;
		this.MD3.DataPropertyName = "D3";
		dataGridViewCellStyle7.Format = "X2";
		this.MD3.DefaultCellStyle = dataGridViewCellStyle7;
		this.MD3.HeaderText = "D3";
		this.MD3.Name = "MD3";
		this.MD3.Width = 37;
		this.MD4.DataPropertyName = "D4";
		dataGridViewCellStyle8.Format = "X2";
		this.MD4.DefaultCellStyle = dataGridViewCellStyle8;
		this.MD4.HeaderText = "D4";
		this.MD4.Name = "MD4";
		this.MD4.Width = 37;
		this.MD5.DataPropertyName = "D5";
		dataGridViewCellStyle9.Format = "X2";
		this.MD5.DefaultCellStyle = dataGridViewCellStyle9;
		this.MD5.HeaderText = "D5";
		this.MD5.Name = "MD5";
		this.MD5.Width = 37;
		this.MD6.DataPropertyName = "D6";
		dataGridViewCellStyle10.Format = "X2";
		this.MD6.DefaultCellStyle = dataGridViewCellStyle10;
		this.MD6.HeaderText = "D6";
		this.MD6.Name = "MD6";
		this.MD6.Width = 37;
		this.MD7.DataPropertyName = "D7";
		dataGridViewCellStyle11.Format = "X2";
		this.MD7.DefaultCellStyle = dataGridViewCellStyle11;
		this.MD7.HeaderText = "D7";
		this.MD7.Name = "MD7";
		this.MD7.Width = 37;
		this.MD8.DataPropertyName = "D8";
		dataGridViewCellStyle12.Format = "X2";
		this.MD8.DefaultCellStyle = dataGridViewCellStyle12;
		this.MD8.HeaderText = "D8";
		this.MD8.Name = "MD8";
		this.MD8.Width = 37;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(12, 80);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(114, 20);
		this.label1.TabIndex = 515;
		this.label1.Text = "Type Sensor:";
		this.Active.AutoSize = true;
		this.Active.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Active.Location = new System.Drawing.Point(131, 81);
		this.Active.Name = "Active";
		this.Active.Size = new System.Drawing.Size(68, 20);
		this.Active.TabIndex = 5;
		this.Active.Text = "Active";
		this.Active.UseVisualStyleBackColor = true;
		this.Passive.AutoSize = true;
		this.Passive.Checked = true;
		this.Passive.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Passive.Location = new System.Drawing.Point(206, 81);
		this.Passive.Name = "Passive";
		this.Passive.Size = new System.Drawing.Size(81, 20);
		this.Passive.TabIndex = 6;
		this.Passive.TabStop = true;
		this.Passive.Text = "Passive";
		this.Passive.UseVisualStyleBackColor = true;
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(8, 347);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(144, 24);
		this.label2.TabIndex = 518;
		this.label2.Text = "Select Strings:";
		this.Signal.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Signal.FormattingEnabled = true;
		this.Signal.Items.AddRange(new object[3] { "Square 12 Volt", "Square 5 Volt", "Sinusoidal" });
		this.Signal.Location = new System.Drawing.Point(550, 50);
		this.Signal.Name = "Signal";
		this.Signal.Size = new System.Drawing.Size(108, 21);
		this.Signal.TabIndex = 9;
		this.label5.AutoSize = true;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.Location = new System.Drawing.Point(478, 49);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(64, 20);
		this.label5.TabIndex = 524;
		this.label5.Text = "Signal:";
		this.SelectString.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.SelectString.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.SelectString.FormattingEnabled = true;
		this.SelectString.Location = new System.Drawing.Point(158, 349);
		this.SelectString.Name = "SelectString";
		this.SelectString.Size = new System.Drawing.Size(380, 24);
		this.SelectString.TabIndex = 7;
		this.SelectString.SelectedIndexChanged += new System.EventHandler(SelectString_SelectedIndexChanged);
		this.Import.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Import.Location = new System.Drawing.Point(235, 863);
		this.Import.Name = "Import";
		this.Import.Size = new System.Drawing.Size(147, 35);
		this.Import.TabIndex = 14;
		this.Import.Text = "Import file";
		this.Import.UseVisualStyleBackColor = true;
		this.Import.Click += new System.EventHandler(Import_Click);
		this.ImportFile.Filter = "trc|*trc|all|*.*";
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(1, 67);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(47, 16);
		this.label3.TabIndex = 530;
		this.label3.Text = "Res2:";
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(1, 41);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(47, 16);
		this.label4.TabIndex = 528;
		this.label4.Text = "Res1:";
		this.Wheel1Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel1Res1.Location = new System.Drawing.Point(56, 37);
		this.Wheel1Res1.Name = "Wheel1Res1";
		this.Wheel1Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel1Res1.TabIndex = 10;
		this.Wheel1Res1.KeyUp += new System.Windows.Forms.KeyEventHandler(Wheel1Res1_KeyUp);
		this.Wheel1Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel1Res2.Location = new System.Drawing.Point(56, 63);
		this.Wheel1Res2.Name = "Wheel1Res2";
		this.Wheel1Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel1Res2.TabIndex = 11;
		this.Wheel1Res2.KeyUp += new System.Windows.Forms.KeyEventHandler(Wheel1Res2_KeyUp);
		this.Code.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Code.Location = new System.Drawing.Point(63, 44);
		this.Code.Name = "Code";
		this.Code.Size = new System.Drawing.Size(67, 22);
		this.Code.TabIndex = 2;
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(1, 46);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(56, 20);
		this.label6.TabIndex = 534;
		this.label6.Text = "Code:";
		this.Percentuale.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Percentuale.Location = new System.Drawing.Point(281, 46);
		this.Percentuale.Name = "Percentuale";
		this.Percentuale.Size = new System.Drawing.Size(84, 22);
		this.Percentuale.TabIndex = 4;
		this.label8.AutoSize = true;
		this.label8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label8.Location = new System.Drawing.Point(246, 48);
		this.label8.Name = "label8";
		this.label8.Size = new System.Drawing.Size(29, 20);
		this.label8.TabIndex = 538;
		this.label8.Text = "%:";
		this.Pausa.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Pausa.Location = new System.Drawing.Point(371, 9);
		this.Pausa.Name = "Pausa";
		this.Pausa.Size = new System.Drawing.Size(84, 22);
		this.Pausa.TabIndex = 1;
		this.label9.AutoSize = true;
		this.label9.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label9.Location = new System.Drawing.Point(301, 11);
		this.label9.Name = "label9";
		this.label9.Size = new System.Drawing.Size(64, 20);
		this.label9.TabIndex = 540;
		this.label9.Text = "Pausa:";
		this.WaitComunication.AutoSize = true;
		this.WaitComunication.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.WaitComunication.Location = new System.Drawing.Point(305, 82);
		this.WaitComunication.Name = "WaitComunication";
		this.WaitComunication.Size = new System.Drawing.Size(154, 20);
		this.WaitComunication.TabIndex = 541;
		this.WaitComunication.Text = "Wait Comunication";
		this.WaitComunication.UseVisualStyleBackColor = true;
		this.EnableMotor.AutoSize = true;
		this.EnableMotor.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.EnableMotor.Location = new System.Drawing.Point(16, 122);
		this.EnableMotor.Name = "EnableMotor";
		this.EnableMotor.Size = new System.Drawing.Size(118, 20);
		this.EnableMotor.TabIndex = 542;
		this.EnableMotor.Text = "Enable Motor";
		this.EnableMotor.UseVisualStyleBackColor = true;
		this.EnableValves.AutoSize = true;
		this.EnableValves.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.EnableValves.Location = new System.Drawing.Point(162, 122);
		this.EnableValves.Name = "EnableValves";
		this.EnableValves.Size = new System.Drawing.Size(127, 20);
		this.EnableValves.TabIndex = 543;
		this.EnableValves.Text = "Enable Valves";
		this.EnableValves.UseVisualStyleBackColor = true;
		this.Spike.AutoSize = true;
		this.Spike.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Spike.Location = new System.Drawing.Point(319, 122);
		this.Spike.Name = "Spike";
		this.Spike.Size = new System.Drawing.Size(66, 20);
		this.Spike.TabIndex = 544;
		this.Spike.Text = "Spike";
		this.Spike.UseVisualStyleBackColor = true;
		this.Wheel1.Controls.Add(this.Copia);
		this.Wheel1.Controls.Add(this.Wheel1Res1);
		this.Wheel1.Controls.Add(this.label4);
		this.Wheel1.Controls.Add(this.Wheel1Res2);
		this.Wheel1.Controls.Add(this.label3);
		this.Wheel1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel1.Location = new System.Drawing.Point(12, 161);
		this.Wheel1.Name = "Wheel1";
		this.Wheel1.Size = new System.Drawing.Size(132, 96);
		this.Wheel1.TabIndex = 545;
		this.Wheel1.TabStop = false;
		this.Wheel1.Text = "Wheel1";
		this.Copia.AutoSize = true;
		this.Copia.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Copia.Location = new System.Drawing.Point(0, 16);
		this.Copia.Name = "Copia";
		this.Copia.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.Copia.Size = new System.Drawing.Size(67, 20);
		this.Copia.TabIndex = 545;
		this.Copia.Text = "Copia";
		this.Copia.UseVisualStyleBackColor = true;
		this.Wheel2.Controls.Add(this.Wheel2Res1);
		this.Wheel2.Controls.Add(this.label10);
		this.Wheel2.Controls.Add(this.Wheel2Res2);
		this.Wheel2.Controls.Add(this.label11);
		this.Wheel2.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel2.Location = new System.Drawing.Point(183, 161);
		this.Wheel2.Name = "Wheel2";
		this.Wheel2.Size = new System.Drawing.Size(132, 96);
		this.Wheel2.TabIndex = 546;
		this.Wheel2.TabStop = false;
		this.Wheel2.Text = "Wheel2";
		this.Wheel2Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel2Res1.Location = new System.Drawing.Point(56, 37);
		this.Wheel2Res1.Name = "Wheel2Res1";
		this.Wheel2Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel2Res1.TabIndex = 10;
		this.label10.AutoSize = true;
		this.label10.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label10.Location = new System.Drawing.Point(1, 41);
		this.label10.Name = "label10";
		this.label10.Size = new System.Drawing.Size(47, 16);
		this.label10.TabIndex = 528;
		this.label10.Text = "Res1:";
		this.Wheel2Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel2Res2.Location = new System.Drawing.Point(56, 63);
		this.Wheel2Res2.Name = "Wheel2Res2";
		this.Wheel2Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel2Res2.TabIndex = 11;
		this.label11.AutoSize = true;
		this.label11.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label11.Location = new System.Drawing.Point(1, 67);
		this.label11.Name = "label11";
		this.label11.Size = new System.Drawing.Size(47, 16);
		this.label11.TabIndex = 530;
		this.label11.Text = "Res2:";
		this.Wheel3.Controls.Add(this.Wheel3Res1);
		this.Wheel3.Controls.Add(this.label12);
		this.Wheel3.Controls.Add(this.Wheel3Res2);
		this.Wheel3.Controls.Add(this.label13);
		this.Wheel3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel3.Location = new System.Drawing.Point(354, 161);
		this.Wheel3.Name = "Wheel3";
		this.Wheel3.Size = new System.Drawing.Size(132, 96);
		this.Wheel3.TabIndex = 547;
		this.Wheel3.TabStop = false;
		this.Wheel3.Text = "Wheel3";
		this.Wheel3Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel3Res1.Location = new System.Drawing.Point(56, 37);
		this.Wheel3Res1.Name = "Wheel3Res1";
		this.Wheel3Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel3Res1.TabIndex = 10;
		this.label12.AutoSize = true;
		this.label12.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label12.Location = new System.Drawing.Point(1, 41);
		this.label12.Name = "label12";
		this.label12.Size = new System.Drawing.Size(47, 16);
		this.label12.TabIndex = 528;
		this.label12.Text = "Res1:";
		this.Wheel3Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel3Res2.Location = new System.Drawing.Point(56, 63);
		this.Wheel3Res2.Name = "Wheel3Res2";
		this.Wheel3Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel3Res2.TabIndex = 11;
		this.label13.AutoSize = true;
		this.label13.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label13.Location = new System.Drawing.Point(1, 67);
		this.label13.Name = "label13";
		this.label13.Size = new System.Drawing.Size(47, 16);
		this.label13.TabIndex = 530;
		this.label13.Text = "Res2:";
		this.Wheel4.Controls.Add(this.Wheel4Res1);
		this.Wheel4.Controls.Add(this.label14);
		this.Wheel4.Controls.Add(this.Wheel4Res2);
		this.Wheel4.Controls.Add(this.label15);
		this.Wheel4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Wheel4.Location = new System.Drawing.Point(525, 161);
		this.Wheel4.Name = "Wheel4";
		this.Wheel4.Size = new System.Drawing.Size(132, 96);
		this.Wheel4.TabIndex = 548;
		this.Wheel4.TabStop = false;
		this.Wheel4.Text = "Wheel4";
		this.Wheel4Res1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel4Res1.Location = new System.Drawing.Point(56, 37);
		this.Wheel4Res1.Name = "Wheel4Res1";
		this.Wheel4Res1.Size = new System.Drawing.Size(66, 20);
		this.Wheel4Res1.TabIndex = 10;
		this.label14.AutoSize = true;
		this.label14.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label14.Location = new System.Drawing.Point(1, 41);
		this.label14.Name = "label14";
		this.label14.Size = new System.Drawing.Size(47, 16);
		this.label14.TabIndex = 528;
		this.label14.Text = "Res1:";
		this.Wheel4Res2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Wheel4Res2.Location = new System.Drawing.Point(56, 63);
		this.Wheel4Res2.Name = "Wheel4Res2";
		this.Wheel4Res2.Size = new System.Drawing.Size(66, 20);
		this.Wheel4Res2.TabIndex = 11;
		this.label15.AutoSize = true;
		this.label15.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label15.Location = new System.Drawing.Point(1, 67);
		this.label15.Name = "label15";
		this.label15.Size = new System.Drawing.Size(47, 16);
		this.label15.TabIndex = 530;
		this.label15.Text = "Res2:";
		this.Coefficient.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Coefficient.Location = new System.Drawing.Point(452, 120);
		this.Coefficient.Name = "Coefficient";
		this.Coefficient.Size = new System.Drawing.Size(66, 22);
		this.Coefficient.TabIndex = 549;
		this.label7.AutoSize = true;
		this.label7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label7.Location = new System.Drawing.Point(400, 122);
		this.label7.Name = "label7";
		this.label7.Size = new System.Drawing.Size(46, 20);
		this.label7.TabIndex = 550;
		this.label7.Text = "Alfa:";
		this.Delta.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Delta.Location = new System.Drawing.Point(592, 120);
		this.Delta.Name = "Delta";
		this.Delta.Size = new System.Drawing.Size(66, 22);
		this.Delta.TabIndex = 551;
		this.label16.AutoSize = true;
		this.label16.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label16.Location = new System.Drawing.Point(529, 122);
		this.label16.Name = "label16";
		this.label16.Size = new System.Drawing.Size(57, 20);
		this.label16.TabIndex = 552;
		this.label16.Text = "Delta:";
		this.Duplica.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Duplica.Location = new System.Drawing.Point(124, 863);
		this.Duplica.Name = "Duplica";
		this.Duplica.Size = new System.Drawing.Size(93, 35);
		this.Duplica.TabIndex = 553;
		this.Duplica.Text = "Duplica";
		this.Duplica.UseVisualStyleBackColor = true;
		this.Duplica.Click += new System.EventHandler(Duplica_Click);
		this.EnableFilter.AutoSize = true;
		this.EnableFilter.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.EnableFilter.Location = new System.Drawing.Point(544, 351);
		this.EnableFilter.Name = "EnableFilter";
		this.EnableFilter.RightToLeft = System.Windows.Forms.RightToLeft.Yes;
		this.EnableFilter.Size = new System.Drawing.Size(109, 20);
		this.EnableFilter.TabIndex = 554;
		this.EnableFilter.Text = "Enable filter";
		this.EnableFilter.UseVisualStyleBackColor = true;
		this.Speed1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Speed1.Location = new System.Drawing.Point(90, 276);
		this.Speed1.Name = "Speed1";
		this.Speed1.Size = new System.Drawing.Size(66, 20);
		this.Speed1.TabIndex = 555;
		this.Speed1.Text = "0";
		this.label17.AutoSize = true;
		this.label17.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label17.Location = new System.Drawing.Point(8, 274);
		this.label17.Name = "label17";
		this.label17.Size = new System.Drawing.Size(76, 20);
		this.label17.TabIndex = 557;
		this.label17.Text = "Speed1:";
		this.Speed2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Speed2.Location = new System.Drawing.Point(257, 276);
		this.Speed2.Name = "Speed2";
		this.Speed2.Size = new System.Drawing.Size(66, 20);
		this.Speed2.TabIndex = 558;
		this.Speed2.Text = "0";
		this.label20.AutoSize = true;
		this.label20.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label20.Location = new System.Drawing.Point(175, 274);
		this.label20.Name = "label20";
		this.label20.Size = new System.Drawing.Size(76, 20);
		this.label20.TabIndex = 559;
		this.label20.Text = "Speed2:";
		this.Speed3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Speed3.Location = new System.Drawing.Point(424, 276);
		this.Speed3.Name = "Speed3";
		this.Speed3.Size = new System.Drawing.Size(66, 20);
		this.Speed3.TabIndex = 560;
		this.Speed3.Text = "0";
		this.label21.AutoSize = true;
		this.label21.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label21.Location = new System.Drawing.Point(342, 274);
		this.label21.Name = "label21";
		this.label21.Size = new System.Drawing.Size(76, 20);
		this.label21.TabIndex = 561;
		this.label21.Text = "Speed3:";
		this.Speed4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Speed4.Location = new System.Drawing.Point(592, 276);
		this.Speed4.Name = "Speed4";
		this.Speed4.Size = new System.Drawing.Size(66, 20);
		this.Speed4.TabIndex = 562;
		this.Speed4.Text = "0";
		this.label22.AutoSize = true;
		this.label22.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label22.Location = new System.Drawing.Point(510, 274);
		this.label22.Name = "label22";
		this.label22.Size = new System.Drawing.Size(76, 20);
		this.label22.TabIndex = 563;
		this.label22.Text = "Speed4:";
		this.Alfa4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa4.Location = new System.Drawing.Point(592, 314);
		this.Alfa4.Name = "Alfa4";
		this.Alfa4.Size = new System.Drawing.Size(66, 20);
		this.Alfa4.TabIndex = 570;
		this.Alfa4.Text = "0";
		this.label23.AutoSize = true;
		this.label23.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label23.Location = new System.Drawing.Point(529, 314);
		this.label23.Name = "label23";
		this.label23.Size = new System.Drawing.Size(56, 20);
		this.label23.TabIndex = 571;
		this.label23.Text = "Alfa4:";
		this.Alfa3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa3.Location = new System.Drawing.Point(424, 314);
		this.Alfa3.Name = "Alfa3";
		this.Alfa3.Size = new System.Drawing.Size(66, 20);
		this.Alfa3.TabIndex = 568;
		this.Alfa3.Text = "0";
		this.label24.AutoSize = true;
		this.label24.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label24.Location = new System.Drawing.Point(362, 314);
		this.label24.Name = "label24";
		this.label24.Size = new System.Drawing.Size(56, 20);
		this.label24.TabIndex = 569;
		this.label24.Text = "Alfa3:";
		this.Alfa2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa2.Location = new System.Drawing.Point(257, 314);
		this.Alfa2.Name = "Alfa2";
		this.Alfa2.Size = new System.Drawing.Size(66, 20);
		this.Alfa2.TabIndex = 566;
		this.Alfa2.Text = "0";
		this.label25.AutoSize = true;
		this.label25.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label25.Location = new System.Drawing.Point(195, 314);
		this.label25.Name = "label25";
		this.label25.Size = new System.Drawing.Size(56, 20);
		this.label25.TabIndex = 567;
		this.label25.Text = "Alfa2:";
		this.Alfa1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f);
		this.Alfa1.Location = new System.Drawing.Point(90, 314);
		this.Alfa1.Name = "Alfa1";
		this.Alfa1.Size = new System.Drawing.Size(66, 20);
		this.Alfa1.TabIndex = 564;
		this.Alfa1.Text = "0";
		this.label26.AutoSize = true;
		this.label26.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label26.Location = new System.Drawing.Point(28, 314);
		this.label26.Name = "label26";
		this.label26.Size = new System.Drawing.Size(56, 20);
		this.label26.TabIndex = 565;
		this.label26.Text = "Alfa1:";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(664, 900);
		base.Controls.Add(this.Alfa4);
		base.Controls.Add(this.label23);
		base.Controls.Add(this.Alfa3);
		base.Controls.Add(this.label24);
		base.Controls.Add(this.Alfa2);
		base.Controls.Add(this.label25);
		base.Controls.Add(this.Alfa1);
		base.Controls.Add(this.label26);
		base.Controls.Add(this.Speed4);
		base.Controls.Add(this.label22);
		base.Controls.Add(this.Speed3);
		base.Controls.Add(this.label21);
		base.Controls.Add(this.Speed2);
		base.Controls.Add(this.label20);
		base.Controls.Add(this.Speed1);
		base.Controls.Add(this.label17);
		base.Controls.Add(this.EnableFilter);
		base.Controls.Add(this.Duplica);
		base.Controls.Add(this.Delta);
		base.Controls.Add(this.label16);
		base.Controls.Add(this.Coefficient);
		base.Controls.Add(this.label7);
		base.Controls.Add(this.Wheel4);
		base.Controls.Add(this.Wheel3);
		base.Controls.Add(this.Wheel2);
		base.Controls.Add(this.Wheel1);
		base.Controls.Add(this.Spike);
		base.Controls.Add(this.EnableValves);
		base.Controls.Add(this.EnableMotor);
		base.Controls.Add(this.WaitComunication);
		base.Controls.Add(this.Pausa);
		base.Controls.Add(this.label9);
		base.Controls.Add(this.Percentuale);
		base.Controls.Add(this.label8);
		base.Controls.Add(this.Code);
		base.Controls.Add(this.label6);
		base.Controls.Add(this.Import);
		base.Controls.Add(this.SelectString);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.Signal);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.Passive);
		base.Controls.Add(this.Active);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Strings);
		base.Controls.Add(this.label19);
		base.Controls.Add(this.SpeedCAN);
		base.Controls.Add(this.Elimina);
		base.Controls.Add(this.Modello);
		base.Controls.Add(this.label18);
		base.Controls.Add(this.Annulla);
		base.Controls.Add(this.Salva);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "ModelloForm";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Modello";
		base.Activated += new System.EventHandler(ModelloForm_Activated);
		base.Load += new System.EventHandler(ModelloForm_Load);
		((System.ComponentModel.ISupportInitialize)this.Strings).EndInit();
		this.Wheel1.ResumeLayout(false);
		this.Wheel1.PerformLayout();
		this.Wheel2.ResumeLayout(false);
		this.Wheel2.PerformLayout();
		this.Wheel3.ResumeLayout(false);
		this.Wheel3.PerformLayout();
		this.Wheel4.ResumeLayout(false);
		this.Wheel4.PerformLayout();
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
