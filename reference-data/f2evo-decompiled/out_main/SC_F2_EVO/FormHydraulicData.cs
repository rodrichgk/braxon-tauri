using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ElectronikSistem;

namespace SC_F2_EVO;

public class FormHydraulicData : Form
{
	private delegate void CyclesLoatedEventHandler(object sender);

	public static bool CheckData;

	public bool IsABSExist = true;

	public bool IsCycleExist = true;

	private bool IsNew;

	private bool IsChangingCycles = true;

	private bool IndexChanged = false;

	private bool GetData = false;

	private Queue<string> BufferTX;

	private Dictionary<int, string> DescriptionText;

	private ComboBox[] Posizioni;

	private TextBox[] Descrizione;

	private ParametriABS ABS;

	private Dictionary<byte, ParametriCanale> Canali;

	private ParametriCanale DatiCanale = null;

	private int ID_ABS;

	private FormReport Terminal;

	public Progress Progressione;

	private string StringaConnessione;

	private string NewName;

	private string SubCodeText;

	private DataTable Nomi;

	private DataTable Cicli;

	private DataTable Valvole;

	private DataTable TestPressioni;

	private JavaScriptSerializer Serializer = new JavaScriptSerializer();

	private int Index = 0;

	private int RowIndex = -1;

	private int RowID = -1;

	private GroupBox[] TestValves;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	public int CodeABS = -1;

	private byte SubCode = 0;

	private sbyte TestFail = -1;

	private sbyte ChannelFail = -1;

	private IContainer components = null;

	private TextBox PressioneMax;

	private ComboBox Test2V1;

	private ComboBox Test2V2;

	private ComboBox Test2V3;

	private ComboBox Test2V4;

	private ComboBox Test2V5;

	private ComboBox Test2V6;

	private ComboBox Test2V7;

	private ComboBox Test2V8;

	private ComboBox Test2V9;

	private ComboBox Test2V10;

	private ComboBox Test2V11;

	private ComboBox Test2V12;

	private GroupBox Valvole2;

	private GroupBox Valvole3;

	private ComboBox Test3V12;

	private ComboBox Test3V1;

	private ComboBox Test3V2;

	private ComboBox Test3V3;

	private ComboBox Test3V4;

	private ComboBox Test3V5;

	private ComboBox Test3V6;

	private ComboBox Test3V7;

	private ComboBox Test3V8;

	private ComboBox Test3V9;

	private ComboBox Test3V10;

	private ComboBox Test3V11;

	private GroupBox Valvole4;

	private ComboBox Test4V12;

	private ComboBox Test4V1;

	private ComboBox Test4V2;

	private ComboBox Test4V3;

	private ComboBox Test4V4;

	private ComboBox Test4V5;

	private ComboBox Test4V6;

	private ComboBox Test4V7;

	private ComboBox Test4V8;

	private ComboBox Test4V9;

	private ComboBox Test4V10;

	private ComboBox Test4V11;

	private GroupBox Valvole5;

	private ComboBox Test5V12;

	private ComboBox Test5V1;

	private ComboBox Test5V2;

	private ComboBox Test5V3;

	private ComboBox Test5V4;

	private ComboBox Test5V5;

	private ComboBox Test5V6;

	private ComboBox Test5V7;

	private ComboBox Test5V8;

	private ComboBox Test5V9;

	private ComboBox Test5V10;

	private ComboBox Test5V11;

	private DataGridView List;

	private Label label1;

	private Label label2;

	private TextBox AllarmeSup;

	private Label label3;

	private TextBox Pulse5;

	private Label label4;

	private TextBox Pulse4;

	private Label Cmp41;

	private GroupBox Test4;

	private ComboBox Val41;

	private Label Cmp44;

	private Label Cmp43;

	private Label Cmp42;

	private ComboBox Val44;

	private ComboBox Val43;

	private ComboBox Val42;

	private GroupBox Test5;

	private ComboBox Val54;

	private ComboBox Val53;

	private ComboBox Val52;

	private ComboBox Val51;

	private Label Cmp54;

	private Label Cmp53;

	private Label Cmp52;

	private Label Cmp51;

	private Button Salva;

	private Button Chiudi;

	private CheckBox Canale41;

	private CheckBox Canale44;

	private CheckBox Canale43;

	private CheckBox Canale42;

	private CheckBox Canale54;

	private CheckBox Canale53;

	private CheckBox Canale52;

	private CheckBox Canale51;

	private Button Invia;

	private Label label5;

	private ComboBox Nome;

	private Label label6;

	private TextBox PressioneMin;

	private CheckBox ControlloPressioni4;

	private CheckBox ControlloPressioni5;

	private GroupBox Test3;

	private ComboBox Val34;

	private ComboBox Val33;

	private ComboBox Val32;

	private CheckBox Canale34;

	private CheckBox Canale33;

	private CheckBox Canale32;

	private ComboBox Val31;

	private CheckBox Canale31;

	private Label label7;

	private Label label8;

	private Label label9;

	private Label label10;

	private Label label11;

	private TextBox AllarmeInf;

	private Label label12;

	private TextBox CorrenteMin;

	private Label label13;

	private TextBox CorrenteMax;

	private Button btnTerminal;

	private Button Clear;

	private CheckBox StopTest3;

	private CheckBox StopTest4;

	private CheckBox StopTest5;

	private Timer TimeOut;

	private ComboBox TypeTest3;

	private Label label15;

	private Button Duplica;

	private Button Elimina;

	private GroupBox Test1;

	private CheckBox Canale14;

	private CheckBox Canale13;

	private CheckBox Canale12;

	private CheckBox Canale11;

	private CheckBox StopTest1;

	private Label label18;

	private TextBox PressioneLavoro;

	private Label label19;

	private TextBox txtSubCode;

	private Label label14;

	private TextBox CodiceABS;

	private Button UpDateName;

	private GroupBox Test6;

	private CheckBox StopTest6;

	private CheckBox ControlloPressioni6;

	private ComboBox Val64;

	private ComboBox Val63;

	private ComboBox Val62;

	private CheckBox Canale64;

	private CheckBox Canale63;

	private CheckBox Canale62;

	private ComboBox Val61;

	private CheckBox Canale61;

	private Label Cmp64;

	private Label Cmp63;

	private Label Cmp62;

	private Label Cmp61;

	private GroupBox Valvole6;

	private ComboBox Test6V12;

	private ComboBox Test6V1;

	private ComboBox Test6V2;

	private ComboBox Test6V3;

	private ComboBox Test6V4;

	private ComboBox Test6V5;

	private ComboBox Test6V6;

	private ComboBox Test6V7;

	private ComboBox Test6V9;

	private ComboBox Test6V10;

	private ComboBox Test6V11;

	private GroupBox Valvole7;

	private ComboBox Test7V12;

	private ComboBox Test7V1;

	private ComboBox Test7V2;

	private ComboBox Test7V3;

	private ComboBox Test7V4;

	private ComboBox Test7V5;

	private ComboBox Test7V6;

	private ComboBox Test7V8;

	private ComboBox Test7V9;

	private ComboBox Test7V10;

	private ComboBox Test7V11;

	private GroupBox Valvole8;

	private ComboBox Test8V12;

	private ComboBox Test8V1;

	private ComboBox Test8V2;

	private ComboBox Test8V3;

	private ComboBox Test8V4;

	private ComboBox Test8V5;

	private ComboBox Test8V6;

	private ComboBox Test8V7;

	private ComboBox Test8V8;

	private ComboBox Test8V9;

	private ComboBox Test8V10;

	private ComboBox Test8V11;

	private ComboBox Test7V7;

	private GroupBox Test8;

	private CheckBox StopTest8;

	private CheckBox ControlloPressioni8;

	private ComboBox Val84;

	private ComboBox Val83;

	private ComboBox Val82;

	private CheckBox Canale84;

	private CheckBox Canale83;

	private CheckBox Canale82;

	private ComboBox Val81;

	private CheckBox Canale81;

	private Label Cmp84;

	private Label Cmp83;

	private Label Cmp82;

	private Label Cmp81;

	private GroupBox Test7;

	private CheckBox StopTest7;

	private CheckBox ControlloPressioni7;

	private ComboBox Val74;

	private ComboBox Val73;

	private ComboBox Val72;

	private CheckBox Canale74;

	private CheckBox Canale73;

	private CheckBox Canale72;

	private ComboBox Val71;

	private CheckBox Canale71;

	private Label Cmp74;

	private Label Cmp73;

	private Label Cmp72;

	private Label Cmp71;

	private ComboBox Test2V13;

	private ComboBox Test2V16;

	private ComboBox Test2V15;

	private ComboBox Test2V14;

	private ComboBox Test3V13;

	private ComboBox Test4V13;

	private ComboBox Test5V13;

	private ComboBox Test6V13;

	private ComboBox Test7V13;

	private ComboBox Test8V13;

	private ComboBox Test3V16;

	private ComboBox Test3V15;

	private ComboBox Test3V14;

	private ComboBox Test4V16;

	private ComboBox Test4V15;

	private ComboBox Test4V14;

	private ComboBox Test5V16;

	private ComboBox Test5V15;

	private ComboBox Test5V14;

	private ComboBox Test6V16;

	private ComboBox Test6V15;

	private ComboBox Test6V14;

	private ComboBox Test7V16;

	private ComboBox Test7V15;

	private ComboBox Test7V14;

	private ComboBox Test8V16;

	private ComboBox Test8V15;

	private ComboBox Test8V14;

	private ComboBox Test6V8;

	private Label label20;

	private TextBox PressioneInizializzazione;

	private ComboBox TestFault;

	private ComboBox CanaleFault;

	private Label label16;

	private Label label17;

	private Label label21;

	private TextBox Temperatura;

	private Label label22;

	private TextBox Resistenza;

	private GroupBox Valvole1;

	private ComboBox Test1V16;

	private ComboBox Test1V15;

	private ComboBox Test1V14;

	private ComboBox Test1V13;

	private ComboBox Test1V12;

	private ComboBox Test1V1;

	private ComboBox Test1V2;

	private ComboBox Test1V3;

	private ComboBox Test1V4;

	private ComboBox Test1V5;

	private ComboBox Test1V6;

	private ComboBox Test1V7;

	private ComboBox Test1V8;

	private ComboBox Test1V9;

	private ComboBox Test1V10;

	private ComboBox Test1V11;

	private ComboBox Val14;

	private ComboBox Val13;

	private ComboBox Val12;

	private ComboBox Val11;

	private Label Cmp14;

	private Label Cmp13;

	private Label Cmp12;

	private Label Cmp11;

	private CheckBox Canale23;

	private CheckBox Canale22;

	private CheckBox Canale21;

	private CheckBox Canale24;

	private CheckBox StopTest2;

	private GroupBox Test2;

	private ComboBox Val24;

	private ComboBox Val23;

	private ComboBox Val22;

	private ComboBox Val21;

	private Label Cmp24;

	private Label Cmp23;

	private Label Cmp22;

	private Label Cmp21;

	private TextBox Testo3;

	private TextBox Testo1;

	private TextBox Testo5;

	private TextBox Testo7;

	private TextBox Testo2;

	private TextBox Testo4;

	private TextBox Testo6;

	private TextBox Testo8;

	private ComboBox Pos4;

	private ComboBox Pos5;

	private ComboBox Pos3;

	private ComboBox Pos1;

	private ComboBox Pos6;

	private ComboBox Pos8;

	private ComboBox Pos7;

	private ComboBox Pos2;

	private Label label23;

	private Label label28;

	private Label label25;

	private Label label24;

	private Label label29;

	private Label label30;

	private Label label26;

	private Label label27;

	private GroupBox TestValvole;

	private ComboBox TestvV16;

	private ComboBox TestvV15;

	private ComboBox TestvV14;

	private ComboBox TestvV13;

	private ComboBox TestvV12;

	private ComboBox TestvV1;

	private ComboBox TestvV2;

	private ComboBox TestvV3;

	private ComboBox TestvV4;

	private ComboBox TestvV5;

	private ComboBox TestvV6;

	private ComboBox TestvV7;

	private ComboBox TestvV8;

	private ComboBox TestvV9;

	private ComboBox TestvV10;

	private ComboBox TestvV11;

	private DataGridViewTextBoxColumn ID;

	private DataGridViewComboBoxColumn CP;

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

	private Label label31;

	private TextBox PressioneRitorno;

	private Label label32;

	private TextBox PressioneBassa;

	private Label label33;

	private TextBox RipetizioneCiclo;

	private event CyclesLoatedEventHandler CyclesLoated;

	public FormHydraulicData(FormHydraulicBench form, Dictionary<int, string> descriptionText, bool IsNew, int codeABS = -1, byte subcode = 0, sbyte testfail = -1, sbyte channelfail = -1)
	{
		this.IsNew = IsNew;
		CodeABS = codeABS;
		SubCode = subcode;
		TestFail = testfail;
		ChannelFail = channelfail;
		Canali = new Dictionary<byte, ParametriCanale>();
		if (form != null)
		{
			BufferTX = form.Comand;
			base.Owner = form;
		}
		DescriptionText = descriptionText;
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		if (CodeABS > -1)
		{
			Command.CommandText = "SELECT ID FROM ABS WHERE CodiceABS = " + CodeABS + " AND SubCode = " + SubCode;
			Command.Connection.Open();
			object obj = Command.ExecuteScalar();
			IsABSExist = obj != null;
			if (IsABSExist)
			{
				int num = (int)obj;
				Command.CommandText = "SELECT Count(*) AS N FROM Cicli\r\n                                        INNER JOIN ValvoleCicli ON Cicli.ID = ValvoleCicli.ID_Cicli\r\n                                        WHERE ID_ABS = " + num + " AND Test = " + TestFail + " AND Canale = " + ChannelFail;
				IsCycleExist = (int)Command.ExecuteScalar() > 0;
			}
			Command.Connection.Close();
			if (!IsABSExist || !IsCycleExist)
			{
				return;
			}
			if (form != null)
			{
				CyclesLoated += form.btnHydraulicLoad_Loated;
			}
		}
		InitializeComponent();
		Descrizione = new TextBox[8] { Testo1, Testo2, Testo3, Testo4, Testo5, Testo6, Testo7, Testo8 };
		TestValves = new GroupBox[9] { TestValvole, Valvole1, Valvole2, Valvole3, Valvole4, Valvole5, Valvole6, Valvole7, Valvole8 };
		if (CodeABS == -1)
		{
			GroupBox[] testValves = TestValves;
			foreach (GroupBox groupBox in testValves)
			{
				foreach (ComboBox control3 in groupBox.Controls)
				{
					byte b = (byte)(byte.Parse(control3.Name.Substring(6)) - 1);
					control3.Left = 4 + b * (control3.Width + 1);
					control3.Top = 26;
				}
			}
		}
		Posizioni = new ComboBox[8] { Pos1, Pos2, Pos3, Pos4, Pos5, Pos6, Pos7, Pos8 };
		List.AutoGenerateColumns = false;
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
		Cicli.Columns["CP"].DefaultValue = false;
		Cicli.Columns["Pressione"].DefaultValue = 390;
		Cicli.Columns["Pausa"].DefaultValue = 100;
		Cicli.Columns["Impulsi"].DefaultValue = 5;
		Cicli.Columns["Pompa"].DefaultValue = true;
		Cicli.Columns["Motore"].DefaultValue = true;
		Cicli.RowDeleted += Cicli_RowDeleted;
		Pos1.Tag = (byte)0;
		Pos2.Tag = (byte)1;
		Pos3.Tag = (byte)2;
		Pos4.Tag = (byte)3;
		Pos5.Tag = (byte)4;
		Pos6.Tag = (byte)5;
		Pos7.Tag = (byte)6;
		Pos8.Tag = (byte)7;
		Pos1.SelectedIndex = 0;
		Pos2.SelectedIndex = 1;
		Pos3.SelectedIndex = 2;
		Pos4.SelectedIndex = 3;
		Pos5.SelectedIndex = 4;
		Pos6.SelectedIndex = 5;
		Pos7.SelectedIndex = 6;
		Pos8.SelectedIndex = 7;
		Val11.Tag = Cmp11;
		Val12.Tag = Cmp12;
		Val13.Tag = Cmp13;
		Val14.Tag = Cmp14;
		Val21.Tag = Cmp21;
		Val22.Tag = Cmp22;
		Val23.Tag = Cmp23;
		Val24.Tag = Cmp24;
		Val41.Tag = Cmp41;
		Val42.Tag = Cmp42;
		Val43.Tag = Cmp43;
		Val44.Tag = Cmp44;
		Val51.Tag = Cmp51;
		Val52.Tag = Cmp52;
		Val53.Tag = Cmp53;
		Val54.Tag = Cmp54;
		Val61.Tag = Cmp61;
		Val62.Tag = Cmp62;
		Val63.Tag = Cmp63;
		Val64.Tag = Cmp64;
		Val71.Tag = Cmp71;
		Val72.Tag = Cmp72;
		Val73.Tag = Cmp73;
		Val74.Tag = Cmp74;
		Val81.Tag = Cmp81;
		Val82.Tag = Cmp82;
		Val83.Tag = Cmp83;
		Val84.Tag = Cmp84;
		Val11.SelectedIndex = 0;
		Val12.SelectedIndex = 0;
		Val13.SelectedIndex = 0;
		Val14.SelectedIndex = 0;
		Val21.SelectedIndex = 0;
		Val22.SelectedIndex = 0;
		Val23.SelectedIndex = 0;
		Val24.SelectedIndex = 0;
		Val31.SelectedIndex = 0;
		Val32.SelectedIndex = 0;
		Val33.SelectedIndex = 0;
		Val34.SelectedIndex = 0;
		Val41.SelectedIndex = 0;
		Val42.SelectedIndex = 0;
		Val43.SelectedIndex = 0;
		Val44.SelectedIndex = 0;
		Val51.SelectedIndex = 0;
		Val52.SelectedIndex = 0;
		Val53.SelectedIndex = 0;
		Val54.SelectedIndex = 0;
		Val61.SelectedIndex = 0;
		Val62.SelectedIndex = 0;
		Val63.SelectedIndex = 0;
		Val64.SelectedIndex = 0;
		Val71.SelectedIndex = 0;
		Val72.SelectedIndex = 0;
		Val73.SelectedIndex = 0;
		Val74.SelectedIndex = 0;
		Val81.SelectedIndex = 0;
		Val82.SelectedIndex = 0;
		Val83.SelectedIndex = 0;
		Val84.SelectedIndex = 0;
		Canale61.Checked = false;
		Canale62.Checked = false;
		Canale63.Checked = false;
		Canale64.Checked = false;
		Canale71.Checked = false;
		Canale72.Checked = false;
		Canale73.Checked = false;
		Canale74.Checked = false;
		Canale81.Checked = false;
		Canale82.Checked = false;
		Canale83.Checked = false;
		Canale84.Checked = false;
		IndexChanged = false;
		List.Columns["CP"].HeaderCell.Style.Font = new Font("Microsoft Sans Serif", 8.75f, FontStyle.Bold);
		List.Columns["Pressione"].HeaderCell.Style.Font = new Font("Microsoft Sans Serif", 8.75f, FontStyle.Bold);
		foreach (Control control4 in base.Controls)
		{
			if (!(control4 is GroupBox) || control4.Name.IndexOf("Valvole") <= -1)
			{
				continue;
			}
			foreach (Control control5 in control4.Controls)
			{
				if (control5 is ComboBox)
				{
					((ComboBox)control5).DataSource = Valvole.Copy();
					((ComboBox)control5).DisplayMember = "Text";
					((ComboBox)control5).ValueMember = "V";
				}
			}
		}
		Nomi = new DataTable();
		TestFault.Tag = (sbyte)TestFault.SelectedIndex;
		CanaleFault.Tag = (sbyte)CanaleFault.SelectedIndex;
		if (CodeABS == -1)
		{
			FillNomi();
			CreaTable();
		}
		else
		{
			LoadABS();
			Invia_Click(null, new EventArgs());
		}
	}

	private void FormHydraulicData_Load(object sender, EventArgs e)
	{
	}

	protected void FillNomi()
	{
		Nomi.Clear();
		Adapter.SelectCommand.CommandText = "SELECT ID, Nome FROM ABS ORDER BY Nome";
		Adapter.Fill(Nomi);
		if (IsNew || Nomi.Rows.Count == 0)
		{
			Nome.DropDownStyle = ComboBoxStyle.Simple;
			IsNew = true;
			ResetABS();
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
		CP.DataPropertyName = Cicli.Columns["CP"].ColumnName;
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
		CP.DataSource = TestPressioni;
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
		CP.DisplayMember = "Text";
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
		CP.ValueMember = "V";
		if (!IsNew)
		{
			foreach (Control control in base.Controls)
			{
				control.Enabled = false;
			}
			Nome.Enabled = true;
			label5.Enabled = true;
		}
		foreach (DataGridViewColumn column in List.Columns)
		{
			column.SortMode = DataGridViewColumnSortMode.NotSortable;
		}
		TypeTest3.SelectedIndex = 0;
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
			if (c == '\n')
			{
				int num = 0;
				object obj = "";
				string text2 = MainMenuForm.DataUart[n].Replace("\r\n", "");
				if (Progressione != null)
				{
					text = text2.Split(':')[0];
					if (text2.Split(':').Length > 1)
					{
						obj = text2.Split(':')[1].Trim();
					}
					if (text.IndexOf("Test") == 0 && text.Length == 5)
					{
						text = "Test";
					}
					if (text.IndexOf("Ciclo") == 0)
					{
						text = "Ciclo";
					}
					if (text.IndexOf("Abilita canale") == 0)
					{
						text = "Abilita canale";
					}
					if (text.IndexOf("Tipo test") == 0)
					{
						text = "Tipo test";
					}
					if (text.IndexOf("Canale") == 0)
					{
						text = "Canale";
					}
					switch (text)
					{
					case "OK":
						if (BufferTX.Count > 0)
						{
							BufferTX.Dequeue();
						}
						if (BufferTX.Count() == 0)
						{
							GetData = true;
							Progressione.Status.Value = 0;
							Progressione.Status.Maximum = 20 + ABS.Test.Count * 12 + ABS.Cicles.Count * 8;
							foreach (ParametriCanale value2 in Canali.Values)
							{
								Progressione.Status.Maximum++;
								Progressione.Status.Maximum += value2.Data.Count * 7;
							}
						}
						else
						{
							Progressione.Status.Value = Progressione.Status.Maximum - BufferTX.Count() + 1;
						}
						break;
					case "ModelABS":
						if (ABS != null)
						{
							CheckData &= obj.ToString() == ABS.Values.Model;
						}
						Progressione.Status.Value = 1;
						break;
					case "Corrente Max":
						CheckData &= float.Parse(obj.ToString().Replace(".", ","), MainMenuForm.Culture) == ABS.Values.C_Max;
						Progressione.Status.Value++;
						break;
					case "Corrente Min":
						CheckData &= float.Parse(obj.ToString().Replace(".", ","), MainMenuForm.Culture) == ABS.Values.C_Min;
						Progressione.Status.Value++;
						break;
					case "Warning Sup":
						CheckData &= float.Parse(obj.ToString().Replace(".", ","), MainMenuForm.Culture) == ABS.Values.W_Sup;
						Progressione.Status.Value++;
						break;
					case "Warning Inf":
						CheckData &= float.Parse(obj.ToString().Replace(".", ","), MainMenuForm.Culture) == ABS.Values.W_Inf;
						Progressione.Status.Value++;
						break;
					case "Pressione Max":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Max;
						Progressione.Status.Value++;
						break;
					case "Pressione Min":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Min;
						Progressione.Status.Value++;
						break;
					case "Pressione Lavoro":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Work;
						Progressione.Status.Value++;
						break;
					case "Pressione Inizializzazione":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Ini;
						Progressione.Status.Value++;
						break;
					case "Pressione Bassa":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Low;
						Progressione.Status.Value++;
						break;
					case "Pressione Ritorno":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.P_Rtn;
						Progressione.Status.Value++;
						break;
					case "Pausa test 4":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.Pulse4;
						Progressione.Status.Value++;
						break;
					case "Pausa test 5":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.Pulse5;
						Progressione.Status.Value++;
						break;
					case "Ripetizione Ciclo":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.Nrpt;
						Progressione.Status.Value++;
						break;
					case "Code ABS":
						CheckData &= short.Parse(obj.ToString()) == ABS.Values.CodiceABS;
						Progressione.Status.Value++;
						break;
					case "Test type3":
						CheckData &= byte.Parse(obj.ToString()) == ABS.Values.TypeTest3;
						Progressione.Status.Value++;
						break;
					case "Temperature":
						CheckData &= byte.Parse(obj.ToString()) == ABS.Values.Temperature;
						Progressione.Status.Value++;
						break;
					case "Resistor":
					{
						short num2 = short.Parse(obj.ToString());
						CheckData &= num2 == ABS.Values.Resistor || num2 == 0;
						FormHydraulicBench.IsResistorChecked = num2 == ABS.Values.Resistor;
						Progressione.Status.Value++;
						break;
					}
					case "Ordine Test":
					{
						string[] array = obj.ToString().Replace(" ", "").Split('O');
						for (int i = 1; i < array.Length; i++)
						{
							sbyte.TryParse(array[i], out var result);
							CheckData &= ABS.Values.Order[i - 1] == result;
						}
						Progressione.Status.Value++;
						break;
					}
					case "Valves":
					{
						string[] array = obj.ToString().Replace(" ", "").Split('V');
						for (int j = 1; j < array.Length; j++)
						{
							sbyte.TryParse(array[j], out var result2);
							CheckData &= ABS.Valves[j - 1] == result2;
						}
						Progressione.Status.Value++;
						break;
					}
					case "Canale":
						if (Canali.Count > 0)
						{
							byte key = byte.Parse(text2.Substring(6, 1));
							DatiCanale = Canali[key];
							Progressione.Status.Value++;
						}
						break;
					case "CHN OnOff":
						if (Canali.Count > 0)
						{
							bool flag = obj.ToString() == "ON";
							CheckData &= DatiCanale.Data[Index].OnOff == flag;
							Progressione.Status.Value++;
						}
						break;
					case "CHN Pressione":
						if (Canali.Count > 0)
						{
							CheckData &= short.Parse(obj.ToString()) == DatiCanale.Data[Index].Pressione;
							Progressione.Status.Value++;
						}
						break;
					case "CHN Impulso":
						if (Canali.Count > 0)
						{
							CheckData &= short.Parse(obj.ToString()) == DatiCanale.Data[Index].Impulso;
							Progressione.Status.Value++;
						}
						break;
					case "CHN NPulses":
						if (Canali.Count > 0)
						{
							CheckData &= uint.Parse(obj.ToString()) == DatiCanale.Data[Index].Impulsi;
							Progressione.Status.Value++;
						}
						break;
					case "CHN Pompa":
						if (Canali.Count > 0)
						{
							bool flag = obj.ToString() == "ON";
							CheckData &= DatiCanale.Data[Index].Pompa == flag;
							Progressione.Status.Value++;
						}
						break;
					case "CHN Motore":
						if (Canali.Count > 0)
						{
							bool flag = obj.ToString() == "ON";
							CheckData &= DatiCanale.Data[Index].Motore == flag;
							Progressione.Status.Value++;
						}
						break;
					case "Test":
						Index = int.Parse(text2.Substring(4, 1)) - 1;
						Progressione.Status.Value++;
						break;
					case "Abilita canale":
					{
						num = int.Parse(text2.Replace(text, "").Substring(0, 1)) - 1;
						bool flag = obj.ToString() == "SI";
						CheckData &= ABS.Test[Index].E[num] == flag;
						Progressione.Status.Value++;
						break;
					}
					case "Tipo test":
					{
						num = int.Parse(text2.Replace(text, "").Substring(0, 1)) - 1;
						byte b = byte.Parse(obj.ToString());
						CheckData &= ABS.Test[Index].T[num] == b;
						Progressione.Status.Value++;
						break;
					}
					case "Controllo pressioni maggiore 390":
					{
						bool flag = obj.ToString() == "SI";
						CheckData &= ABS.Test[Index].C == flag;
						if (Progressione != null)
						{
							Progressione.Status.Value++;
						}
						break;
					}
					case "Stop Test":
					{
						bool flag = obj.ToString() == "SI";
						CheckData &= ABS.Test[Index].S == flag;
						Progressione.Status.Value++;
						break;
					}
					case "Valvole Test":
					{
						string[] array = obj.ToString().Replace(" ", "").Split('V');
						for (int l = 1; l < array.Length; l++)
						{
							sbyte.TryParse(array[l], out var result4);
							CheckData &= ABS.Test[Index].V[l - 1] == result4;
						}
						Progressione.Status.Value++;
						break;
					}
					case "Ciclo":
					{
						string s = text2.Replace(":", "").Substring(5);
						Index = int.Parse(s) - 1;
						if (Canali.Count != 0 || Progressione.Status.Value != Progressione.Status.Maximum)
						{
							Progressione.Status.Value++;
						}
						break;
					}
					case "Controllo pressioni":
					{
						bool flag = obj.ToString() == "SI";
						CheckData &= ABS.Cicles[Index].C == flag;
						Progressione.Status.Value++;
						break;
					}
					case "Pressione":
						CheckData &= short.Parse(obj.ToString()) == ABS.Cicles[Index].P;
						Progressione.Status.Value++;
						break;
					case "Impulso":
						CheckData &= short.Parse(obj.ToString()) == ABS.Cicles[Index].m;
						Progressione.Status.Value++;
						break;
					case "NPulses":
						CheckData &= uint.Parse(obj.ToString()) == ABS.Cicles[Index].NPulses;
						Progressione.Status.Value++;
						break;
					case "Pompa":
					{
						bool flag = obj.ToString() == "ON";
						CheckData &= ABS.Cicles[Index].Pompa == flag;
						Progressione.Status.Value++;
						break;
					}
					case "Motore":
					{
						bool flag = obj.ToString() == "ON";
						CheckData &= ABS.Cicles[Index].Motore == flag;
						Progressione.Status.Value++;
						break;
					}
					case "Valvole Ciclo":
					{
						string[] array = obj.ToString().Replace(" ", "").Split('V');
						for (int k = 1; k < array.Length; k++)
						{
							sbyte.TryParse(array[k], out var result3);
							CheckData &= ABS.Cicles[Index].V[k - 1] == result3;
						}
						Progressione.Status.Value++;
						break;
					}
					case "ABS caricato.":
					{
						TimeOut.Enabled = false;
						int maximum = Progressione.Status.Maximum;
						int value = Progressione.Status.Value;
						Progressione.Close();
						Progressione.Dispose();
						Progressione = null;
						if (!CheckData || maximum != value)
						{
							if (this.CyclesLoated != null)
							{
								this.CyclesLoated("Error: ABS data incorrect!!!");
							}
							else
							{
								MessageBox.Show("Error: Dati ABS non corretti.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
							}
						}
						else if (this.CyclesLoated != null)
						{
							this.CyclesLoated("OK");
						}
						else
						{
							CodeABS = ABS.Values.CodiceABS;
							base.DialogResult = DialogResult.OK;
						}
						break;
					}
					}
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
	}

	private void AddReport(string report)
	{
		if (Terminal != null)
		{
			Terminal.Report.Text += report;
			Application.DoEvents();
		}
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

	private void Validating_Float(object sender, CancelEventArgs e)
	{
		TextBox textBox = sender as TextBox;
		if (!float.TryParse(textBox.Text.Replace(".", ","), NumberStyles.Float | NumberStyles.AllowThousands, MainMenuForm.Culture, out var _))
		{
			MessageBox.Show("Warning: valore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			e.Cancel = true;
		}
	}

	private void Validating_Short(object sender, CancelEventArgs e)
	{
		TextBox textBox = sender as TextBox;
		if (!short.TryParse(textBox.Text, out var _))
		{
			MessageBox.Show("Warning: valore non valido.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			e.Cancel = true;
		}
	}

	private void List_DataError(object sender, DataGridViewDataErrorEventArgs e)
	{
	}

	private string CheckFields()
	{
		string result = null;
		if (Nome.Tag.ToString().Trim() == "")
		{
			result = "Inserisci il nome.";
		}
		return result;
	}

	private void Val_SelectedIndexChanged(object sender, EventArgs e)
	{
		ComboBox comboBox = sender as ComboBox;
		Label label = comboBox.Tag as Label;
		if (comboBox.SelectedIndex == 0 || comboBox.SelectedIndex == 3)
		{
			label.Text = ">";
		}
		else
		{
			label.Text = "<";
		}
	}

	private void FillParametri()
	{
		GetData = false;
		DatiCanale = null;
		ABS = new ParametriABS(CorrenteMax, CorrenteMin, AllarmeSup, AllarmeInf, PressioneMax, PressioneMin, PressioneLavoro, PressioneInizializzazione, PressioneBassa, PressioneRitorno, Pulse4, Pulse5, RipetizioneCiclo, CodiceABS, Temperatura, Resistenza, (byte)TypeTest3.SelectedIndex);
		if (CodeABS == -1)
		{
			if (NewName == null)
			{
				ABS.Values.Model = Nome.Tag.ToString();
			}
			else
			{
				ABS.Values.Model = NewName;
			}
		}
		else
		{
			Command.CommandText = "SELECT Nome FROM ABS WHERE CodiceABS = " + CodeABS + " AND SubCode = " + SubCode;
			Command.Connection.Open();
			ABS.Values.Model = Command.ExecuteScalar().ToString();
			Command.Connection.Close();
		}
		ParametriTest parametriTest = new ParametriTest();
		parametriTest.NTest = 1;
		parametriTest.E = new bool[4] { Canale11.Checked, Canale12.Checked, Canale13.Checked, Canale14.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val11.SelectedIndex,
			(byte)Val12.SelectedIndex,
			(byte)Val13.SelectedIndex,
			(byte)Val14.SelectedIndex
		};
		parametriTest.C = false;
		parametriTest.S = StopTest1.Checked;
		parametriTest.V.Add((sbyte)Test1V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test1V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 2;
		parametriTest.E = new bool[4] { Canale21.Checked, Canale22.Checked, Canale23.Checked, Canale24.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val21.SelectedIndex,
			(byte)Val22.SelectedIndex,
			(byte)Val23.SelectedIndex,
			(byte)Val24.SelectedIndex
		};
		parametriTest.C = false;
		parametriTest.S = StopTest2.Checked;
		parametriTest.V.Add((sbyte)Test2V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test2V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 3;
		parametriTest.E = new bool[4] { Canale31.Checked, Canale32.Checked, Canale33.Checked, Canale34.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val31.SelectedIndex,
			(byte)Val32.SelectedIndex,
			(byte)Val33.SelectedIndex,
			(byte)Val34.SelectedIndex
		};
		parametriTest.C = false;
		parametriTest.S = StopTest3.Checked;
		parametriTest.V.Add((sbyte)Test3V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test3V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 4;
		parametriTest.E = new bool[4] { Canale41.Checked, Canale42.Checked, Canale43.Checked, Canale44.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val41.SelectedIndex,
			(byte)Val42.SelectedIndex,
			(byte)Val43.SelectedIndex,
			(byte)Val44.SelectedIndex
		};
		parametriTest.C = ControlloPressioni4.Checked;
		parametriTest.S = StopTest4.Checked;
		parametriTest.V.Add((sbyte)Test4V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test4V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 5;
		parametriTest.E = new bool[4] { Canale51.Checked, Canale52.Checked, Canale53.Checked, Canale54.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val51.SelectedIndex,
			(byte)Val52.SelectedIndex,
			(byte)Val53.SelectedIndex,
			(byte)Val54.SelectedIndex
		};
		parametriTest.C = ControlloPressioni5.Checked;
		parametriTest.S = StopTest5.Checked;
		parametriTest.V.Add((sbyte)Test5V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test5V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 6;
		parametriTest.E = new bool[4] { Canale61.Checked, Canale62.Checked, Canale63.Checked, Canale64.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val61.SelectedIndex,
			(byte)Val62.SelectedIndex,
			(byte)Val63.SelectedIndex,
			(byte)Val64.SelectedIndex
		};
		parametriTest.C = ControlloPressioni6.Checked;
		parametriTest.S = StopTest6.Checked;
		parametriTest.V.Add((sbyte)Test6V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test6V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 7;
		parametriTest.E = new bool[4] { Canale71.Checked, Canale72.Checked, Canale73.Checked, Canale74.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val71.SelectedIndex,
			(byte)Val72.SelectedIndex,
			(byte)Val73.SelectedIndex,
			(byte)Val74.SelectedIndex
		};
		parametriTest.C = ControlloPressioni7.Checked;
		parametriTest.S = StopTest7.Checked;
		parametriTest.V.Add((sbyte)Test7V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test7V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		parametriTest = new ParametriTest();
		parametriTest.NTest = 8;
		parametriTest.E = new bool[4] { Canale81.Checked, Canale82.Checked, Canale83.Checked, Canale84.Checked };
		parametriTest.T = new byte[4]
		{
			(byte)Val81.SelectedIndex,
			(byte)Val82.SelectedIndex,
			(byte)Val83.SelectedIndex,
			(byte)Val84.SelectedIndex
		};
		parametriTest.C = ControlloPressioni8.Checked;
		parametriTest.S = StopTest8.Checked;
		parametriTest.V.Add((sbyte)Test8V1.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V2.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V3.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V4.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V5.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V6.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V7.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V8.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V9.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V10.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V11.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V12.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V13.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V14.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V15.SelectedValue);
		parametriTest.V.Add((sbyte)Test8V16.SelectedValue);
		ABS.Test.Add(parametriTest);
		ABS.Valves.Add((sbyte)TestvV1.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV2.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV3.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV4.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV5.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV6.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV7.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV8.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV9.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV10.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV11.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV12.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV13.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV14.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV15.SelectedValue);
		ABS.Valves.Add((sbyte)TestvV16.SelectedValue);
		ABS.Values.Order[0] = (sbyte)Pos1.SelectedIndex;
		ABS.Values.Order[1] = (sbyte)Pos2.SelectedIndex;
		ABS.Values.Order[2] = (sbyte)Pos3.SelectedIndex;
		ABS.Values.Order[3] = (sbyte)Pos4.SelectedIndex;
		ABS.Values.Order[4] = (sbyte)Pos5.SelectedIndex;
		ABS.Values.Order[5] = (sbyte)Pos6.SelectedIndex;
		ABS.Values.Order[6] = (sbyte)Pos7.SelectedIndex;
		ABS.Values.Order[7] = (sbyte)Pos8.SelectedIndex;
		foreach (DataRow row in Cicli.Rows)
		{
			if (row.RowState == DataRowState.Deleted)
			{
				continue;
			}
			ParametriCiclo parametriCiclo = new ParametriCiclo();
			parametriCiclo.NCiclo = (byte)row["ID"];
			parametriCiclo.C = (bool)row["CP"];
			parametriCiclo.P = (short)row["Pressione"];
			parametriCiclo.m = (short)row["Pausa"];
			parametriCiclo.NPulses = (uint)row["Impulsi"];
			parametriCiclo.Pompa = (bool)row["Pompa"];
			parametriCiclo.Motore = (bool)row["Motore"];
			for (int i = 1; i < 17; i++)
			{
				sbyte b = (sbyte)row["V" + i];
				if (b == -1 && (TestFail > 0 || (sbyte)TestFault.Tag > 0))
				{
					b = -2;
				}
				parametriCiclo.V.Add(b);
			}
			if (parametriCiclo.NCiclo > 0)
			{
				ABS.Cicles.Add(parametriCiclo);
			}
		}
		Canali.Clear();
		if (TestFault.SelectedIndex != 0)
		{
			return;
		}
		DataTable dataTable = new DataTable();
		for (byte b2 = 1; b2 <= 4; b2++)
		{
			dataTable.Clear();
			Adapter.SelectCommand.CommandText = "SELECT * FROM Canali WHERE Canale = " + b2 + " ORDER BY Ciclo";
			Adapter.Fill(dataTable);
			if (dataTable.Rows.Count > 0)
			{
				ParametriCanale parametriCanale = new ParametriCanale();
				foreach (DataRow row2 in dataTable.Rows)
				{
					DataCanale dataCanale = new DataCanale();
					dataCanale.Channel = b2;
					dataCanale.NData = (byte)row2["Ciclo"];
					dataCanale.OnOff = (bool)row2["OnOff"];
					dataCanale.Pressione = (short)row2["Pressione"];
					dataCanale.Impulso = (short)row2["Impulso"];
					dataCanale.Impulsi = (uint)(int)row2["Impulsi"];
					dataCanale.Pompa = (bool)row2["Pompa"];
					dataCanale.Motore = (bool)row2["Motore"];
					parametriCanale.Data.Add(dataCanale);
				}
				Canali.Add(b2, parametriCanale);
			}
		}
	}

	private void Salva_Click(object sender, EventArgs e)
	{
		string message = CheckFields();
		if (message != null)
		{
			MessageBox.Show("Warning: " + message, "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			return;
		}
		if (!Duplica.Equals(sender) && Nome.DropDownStyle == ComboBoxStyle.Simple && ID_ABS > -1)
		{
			Command.Connection.Open();
			Command.CommandText = "UPDATE ABS SET Nome = '" + Nome.Text + "' WHERE ID = " + ID_ABS;
			Command.ExecuteNonQuery();
			FillNomi();
			Nome.SelectedValue = ID_ABS;
			Command.Connection.Close();
			Nome.DropDownStyle = ComboBoxStyle.DropDownList;
			Application.DoEvents();
		}
		FillParametri();
		Command.Connection.Open();
		if (Nome.DropDownStyle == ComboBoxStyle.Simple)
		{
			string text = "INSERT INTO ABS ([Nome], [CorrenteMax], [CorrenteMin], [AllarmeSup], [AllarmeInf], [PressioneMax], [PressioneMin], [PressioneLavoro], [PressioneInizializzazione], [PressioneBassa], [PressioneRitorno], [Pulse4], [Pulse5], [CodiceABS], [SubCode], [TipoTest3], [Temperatura], [Resistenza]) VALUES (";
			text = text + "'" + ABS.Values.Model + "',";
			text = text + ABS.Values.C_Max.ToString().Replace(",", ".") + ",";
			text = text + ABS.Values.C_Min.ToString().Replace(",", ".") + ",";
			text = text + ABS.Values.W_Sup.ToString().Replace(",", ".") + ",";
			text = text + ABS.Values.W_Inf.ToString().Replace(",", ".") + ",";
			text = text + ABS.Values.P_Max + ",";
			text = text + ABS.Values.P_Min + ",";
			text = text + ABS.Values.P_Work + ",";
			text = text + ABS.Values.P_Ini + ",";
			text = text + ABS.Values.P_Low + ",";
			text = text + ABS.Values.P_Rtn + ",";
			text = text + ABS.Values.Pulse4 + ",";
			text = text + ABS.Values.Pulse5 + ",";
			text = text + ABS.Values.CodiceABS + ",";
			text = text + txtSubCode.Text + ",";
			text = text + ABS.Values.TypeTest3 + ",";
			text = text + ABS.Values.Temperature + ",";
			text += ABS.Values.Resistor;
			text += ")";
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			Command.CommandText = "SELECT MAX(ID) FROM ABS";
			int idABS = (int)Command.ExecuteScalar();
			AddTests(idABS);
			foreach (ParametriCiclo cicle in ABS.Cicles)
			{
				text = "INSERT INTO Cicli ([ID_ABS], [Ciclo], [CP], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore], [Test], [Canale]) VALUES (";
				text = text + idABS + ",";
				text = text + cicle.NCiclo + ",";
				text = text + cicle.C + ",";
				text = text + cicle.P + ",";
				text = text + cicle.m + ",";
				text = text + cicle.NPulses + ",";
				text = text + cicle.Pompa + ",";
				text = text + cicle.Motore + ",";
				text = text + (sbyte)TestFault.Tag + ",";
				text += (sbyte)CanaleFault.Tag;
				text += ")";
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
				Command.CommandText = "SELECT MAX(ID) FROM Cicli";
				int num = (int)Command.ExecuteScalar();
				text = "INSERT INTO ValvoleCicli ([ID_Cicli], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16]) VALUES (";
				text += num;
				for (byte b = 0; b < 16; b++)
				{
					text = text + "," + ((cicle.V[b] != -2) ? cicle.V[b] : (-1));
				}
				text += ")";
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
			}
			text = "INSERT INTO Ripetizioni ([ID_ABS], [Test], [Canale], [Ripetizione]) VALUES (" + idABS + ", " + (sbyte)TestFault.Tag + ", " + (sbyte)CanaleFault.Tag + ", " + ABS.Values.Nrpt + ")";
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			text = "INSERT INTO TestValvole ([ID_ABS], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16]) VALUES (";
			text += idABS;
			foreach (sbyte valf in ABS.Valves)
			{
				text = text + "," + (byte)valf;
			}
			text += ")";
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			text = "INSERT INTO OrdineTest ([ID_ABS], [Pos1], [Pos2], [Pos3], [Pos4], [Pos5], [Pos6], [Pos7], [Pos8]) VALUES (";
			text += idABS;
			sbyte[] order = ABS.Values.Order;
			for (int i = 0; i < order.Length; i++)
			{
				text = text + "," + (byte)order[i];
			}
			text += ")";
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
		}
		else
		{
			int idABS = ID_ABS;
			string text = "UPDATE ABS SET ";
			text = text + "[Nome] = '" + ABS.Values.Model + "', ";
			text = text + "[CorrenteMax] = " + ABS.Values.C_Max.ToString().Replace(",", ".") + ",";
			text = text + "[CorrenteMin] = " + ABS.Values.C_Min.ToString().Replace(",", ".") + ",";
			text = text + "[AllarmeSup] = " + ABS.Values.W_Sup.ToString().Replace(",", ".") + ",";
			text = text + "[AllarmeInf] = " + ABS.Values.W_Inf.ToString().Replace(",", ".") + ",";
			text = text + "[PressioneMax] = " + ABS.Values.P_Max + ",";
			text = text + "[PressioneMin] = " + ABS.Values.P_Min + ",";
			text = text + "[PressioneLavoro] = " + ABS.Values.P_Work + ",";
			text = text + "[PressioneInizializzazione] = " + ABS.Values.P_Ini + ",";
			text = text + "[PressioneBassa] = " + ABS.Values.P_Low + ",";
			text = text + "[PressioneRitorno] = " + ABS.Values.P_Rtn + ",";
			text = text + "[Pulse4] = " + ABS.Values.Pulse4 + ",";
			text = text + "[Pulse5] = " + ABS.Values.Pulse5 + ",";
			text = text + "[CodiceABS] = " + ABS.Values.CodiceABS + ",";
			text = text + "[SubCode] = " + txtSubCode.Text + ",";
			text = text + "[TipoTest3] = " + ABS.Values.TypeTest3 + ",";
			text = text + "[Temperatura] = " + ABS.Values.Temperature + ",";
			text = text + "[Resistenza] = " + ABS.Values.Resistor;
			text = text + " WHERE ID = " + idABS;
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			foreach (ParametriTest item in ABS.Test)
			{
				Command.CommandText = "SELECT ID FROM Test WHERE ID_ABS = " + idABS + " AND Test = " + item.NTest;
				object obj = Command.ExecuteScalar();
				if (obj == null)
				{
					AddTests(idABS);
					break;
				}
				int num2 = (int)obj;
				text = "UPDATE Test SET ";
				text = text + "[Descrizione] = '" + Descrizione[item.NTest - 1].Text + "',";
				text = text + "[T1] = " + item.T[0] + ",";
				text = text + "[T2] = " + item.T[1] + ",";
				text = text + "[T3] = " + item.T[2] + ",";
				text = text + "[T4] = " + item.T[3] + ",";
				text = text + "[E1] = " + item.E[0] + ",";
				text = text + "[E2] = " + item.E[1] + ",";
				text = text + "[E3] = " + item.E[2] + ",";
				text = text + "[E4] = " + item.E[3] + ",";
				text = text + "[C] = " + item.C + ",";
				text = text + "[S] = " + item.S;
				text = text + " WHERE ID = " + num2;
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
				Command.CommandText = "SELECT ID FROM ValvoleTest WHERE ID_Test = " + num2;
				int num3 = (int)Command.ExecuteScalar();
				text = "UPDATE ValvoleTest SET ";
				text = text + "[ID_Test] = " + num2 + ",";
				text = text + "[V1] = " + item.V[0] + ",";
				text = text + "[V2] = " + item.V[1] + ",";
				text = text + "[V3] = " + item.V[2] + ",";
				text = text + "[V4] = " + item.V[3] + ",";
				text = text + "[V5] = " + item.V[4] + ",";
				text = text + "[V6] = " + item.V[5] + ",";
				text = text + "[V7] = " + item.V[6] + ",";
				text = text + "[V8] = " + item.V[7] + ",";
				text = text + "[V9] = " + item.V[8] + ",";
				text = text + "[V10] = " + item.V[9] + ",";
				text = text + "[V11] = " + item.V[10] + ",";
				text = text + "[V12] = " + item.V[11] + ",";
				text = text + "[V13] = " + item.V[12] + ",";
				text = text + "[V14] = " + item.V[13] + ",";
				text = text + "[V15] = " + item.V[14] + ",";
				text = text + "[V16] = " + item.V[15];
				text = text + " WHERE ID = " + num3;
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
			}
			foreach (ParametriCiclo cicle2 in ABS.Cicles)
			{
				Command.CommandText = "SELECT Count(*) FROM Cicli WHERE ID_ABS = " + idABS + " AND Ciclo = " + cicle2.NCiclo + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
				switch ((int)Command.ExecuteScalar())
				{
				case 1:
				{
					text = "UPDATE Cicli SET ";
					text = text + "CP = " + cicle2.C + ", ";
					text = text + "Pressione = " + cicle2.P + ", ";
					text = text + "Impulso = " + cicle2.m + ", ";
					text = text + "Impulsi = " + cicle2.NPulses + ", ";
					text = text + "Pompa = " + cicle2.Pompa + ", ";
					text = text + "Motore = " + cicle2.Motore + ", ";
					text = text + "Test = " + (sbyte)TestFault.Tag + ", ";
					text = text + "Canale = " + (sbyte)CanaleFault.Tag;
					text = text + " WHERE ID_ABS = " + idABS + " AND Ciclo = " + cicle2.NCiclo + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					Command.CommandText = "SELECT ID FROM Cicli WHERE ID_ABS = " + idABS + " AND Ciclo = " + cicle2.NCiclo + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
					int num5 = (int)Command.ExecuteScalar();
					Command.CommandText = "SELECT ID FROM ValvoleCicli WHERE ID_Cicli = " + num5;
					int num6 = (int)Command.ExecuteScalar();
					text = "UPDATE ValvoleCicli SET ";
					text = text + "[V1] = " + ((cicle2.V[0] != -2) ? cicle2.V[0] : (-1)) + ",";
					text = text + "[V2] = " + ((cicle2.V[1] != -2) ? cicle2.V[1] : (-1)) + ",";
					text = text + "[V3] = " + ((cicle2.V[2] != -2) ? cicle2.V[2] : (-1)) + ",";
					text = text + "[V4] = " + ((cicle2.V[3] != -2) ? cicle2.V[3] : (-1)) + ",";
					text = text + "[V5] = " + ((cicle2.V[4] != -2) ? cicle2.V[4] : (-1)) + ",";
					text = text + "[V6] = " + ((cicle2.V[5] != -2) ? cicle2.V[5] : (-1)) + ",";
					text = text + "[V7] = " + ((cicle2.V[6] != -2) ? cicle2.V[6] : (-1)) + ",";
					text = text + "[V8] = " + ((cicle2.V[7] != -2) ? cicle2.V[7] : (-1)) + ",";
					text = text + "[V9] = " + ((cicle2.V[8] != -2) ? cicle2.V[8] : (-1)) + ",";
					text = text + "[V10] = " + ((cicle2.V[9] != -2) ? cicle2.V[9] : (-1)) + ",";
					text = text + "[V11] = " + ((cicle2.V[10] != -2) ? cicle2.V[10] : (-1)) + ",";
					text = text + "[V12] = " + ((cicle2.V[11] != -2) ? cicle2.V[11] : (-1)) + ",";
					text = text + "[V13] = " + ((cicle2.V[12] != -2) ? cicle2.V[12] : (-1)) + ",";
					text = text + "[V14] = " + ((cicle2.V[13] != -2) ? cicle2.V[13] : (-1)) + ",";
					text = text + "[V15] = " + ((cicle2.V[14] != -2) ? cicle2.V[14] : (-1)) + ",";
					text = text + "[V16] = " + ((cicle2.V[15] != -2) ? cicle2.V[15] : (-1));
					text = text + " WHERE ID = " + num6;
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					break;
				}
				case 0:
				{
					text = "INSERT INTO Cicli ([ID_ABS], [Ciclo], [CP], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore], [Test], [Canale]) VALUES (";
					text = text + idABS + ",";
					text = text + cicle2.NCiclo + ",";
					text = text + cicle2.C + ",";
					text = text + cicle2.P + ",";
					text = text + cicle2.m + ",";
					text = text + cicle2.NPulses + ",";
					text = text + cicle2.Pompa + ",";
					text = text + cicle2.Motore + ",";
					text = text + (sbyte)TestFault.Tag + ",";
					text += (sbyte)CanaleFault.Tag;
					text += ")";
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					Command.CommandText = "SELECT MAX(ID) FROM Cicli";
					int num4 = (int)Command.ExecuteScalar();
					text = "INSERT INTO ValvoleCicli ([ID_Cicli], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16]) VALUES (";
					text += num4;
					for (byte b2 = 0; b2 < 16; b2++)
					{
						text = text + "," + ((cicle2.V[b2] != -2) ? cicle2.V[b2] : (-1));
					}
					text += ")";
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					break;
				}
				default:
					throw new Exception("Valore duplicato.");
				}
			}
			Command.CommandText = "SELECT Count(*) AS N FROM Ripetizioni WHERE ID_ABS = " + idABS + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
			int num7 = (int)Command.ExecuteScalar();
			text = ((num7 != 1) ? ("INSERT INTO Ripetizioni ([ID_ABS], [Test], [Canale], [Ripetizione]) VALUES (" + idABS + ", " + (sbyte)TestFault.Tag + ", " + (sbyte)CanaleFault.Tag + ", " + RipetizioneCiclo.Text + ")") : ("UPDATE Ripetizioni SET Ripetizione = " + ABS.Values.Nrpt + " WHERE ID_ABS = " + idABS + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag));
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			if (ABS.Cicles.Count > 0)
			{
				text = "DELETE FROM Cicli WHERE ID_ABS = " + idABS + " AND Ciclo > " + ABS.Cicles[ABS.Cicles.Count - 1].NCiclo + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
			}
			text = "UPDATE TestValvole SET ";
			text = text + "[V1] = " + ABS.Valves[0] + ",";
			text = text + "[V2] = " + ABS.Valves[1] + ",";
			text = text + "[V3] = " + ABS.Valves[2] + ",";
			text = text + "[V4] = " + ABS.Valves[3] + ",";
			text = text + "[V5] = " + ABS.Valves[4] + ",";
			text = text + "[V6] = " + ABS.Valves[5] + ",";
			text = text + "[V7] = " + ABS.Valves[6] + ",";
			text = text + "[V8] = " + ABS.Valves[7] + ",";
			text = text + "[V9] = " + ABS.Valves[8] + ",";
			text = text + "[V10] = " + ABS.Valves[9] + ",";
			text = text + "[V11] = " + ABS.Valves[10] + ",";
			text = text + "[V12] = " + ABS.Valves[11] + ",";
			text = text + "[V13] = " + ABS.Valves[12] + ",";
			text = text + "[V14] = " + ABS.Valves[13] + ",";
			text = text + "[V15] = " + ABS.Valves[14] + ",";
			text = text + "[V16] = " + ABS.Valves[15];
			text = text + " WHERE ID_ABS = " + idABS;
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
			text = "UPDATE OrdineTest SET ";
			text = text + "[Pos1] = " + ABS.Values.Order[0] + ",";
			text = text + "[Pos2] = " + ABS.Values.Order[1] + ",";
			text = text + "[Pos3] = " + ABS.Values.Order[2] + ",";
			text = text + "[Pos4] = " + ABS.Values.Order[3] + ",";
			text = text + "[Pos5] = " + ABS.Values.Order[4] + ",";
			text = text + "[Pos6] = " + ABS.Values.Order[5] + ",";
			text = text + "[Pos7] = " + ABS.Values.Order[6] + ",";
			text = text + "[Pos8] = " + ABS.Values.Order[7];
			text = text + " WHERE ID_ABS = " + idABS;
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
		}
		if (IsNew)
		{
			IsNew = false;
			int iD_ABS = ID_ABS;
			FillNomi();
			Application.DoEvents();
			Command.CommandText = "SELECT MAX(ID) FROM ABS";
			int num8 = (int)Command.ExecuteScalar();
			Nome.SelectedValue = num8;
			if (Duplica.Equals(sender))
			{
				DuplicaCicles(iD_ABS);
			}
			Command.Connection.Close();
		}
		MessageBox.Show("Salvataggio completato.", "Informazione", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
		Command.Connection.Close();
		foreach (DataRow row in Cicli.Rows)
		{
			if (row.RowState != DataRowState.Deleted)
			{
				row.AcceptChanges();
			}
		}
		File.Copy("HydraulicData.accdb", "Backup" + (int)DateTime.Now.DayOfWeek + ".accdb", overwrite: true);
	}

	private void AddTests(int idABS)
	{
		foreach (ParametriTest item in ABS.Test)
		{
			string text = "INSERT INTO Test ([ID_ABS], [Descrizione], [Test], [T1], [T2], [T3], [T4], [E1], [E2], [E3], [E4], [C], [S]) VALUES (";
			text = text + idABS + ",";
			text = text + "'" + Descrizione[item.NTest - 1].Text + "',";
			text = text + item.NTest + ",";
			text = text + item.T[0] + ",";
			text = text + item.T[1] + ",";
			text = text + item.T[2] + ",";
			text = text + item.T[3] + ",";
			text = text + item.E[0] + ",";
			text = text + item.E[1] + ",";
			text = text + item.E[2] + ",";
			text = text + item.E[3] + ",";
			text = text + item.C + ",";
			text += item.S;
			text += ")";
			if (!ExecuteQuery(text, out var message))
			{
				throw new Exception(message);
			}
			Command.CommandText = "SELECT MAX(ID) FROM Test";
			int num = (int)Command.ExecuteScalar();
			text = "INSERT INTO ValvoleTest ([ID_Test], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16]) VALUES (";
			text += num;
			foreach (sbyte item2 in item.V)
			{
				text = text + "," + item2;
			}
			text += ")";
			if (!ExecuteQuery(text, out message))
			{
				throw new Exception(message);
			}
		}
	}

	private void Annulla_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.Cancel;
	}

	private void CycleCanged(object sender, EventArgs e)
	{
		if (IsChangingCycles)
		{
			return;
		}
		IsChangingCycles = true;
		bool flag = false;
		foreach (DataRow row in Cicli.Rows)
		{
			flag |= row.RowState != DataRowState.Unchanged;
		}
		if ((flag | IndexChanged) && MessageBox.Show("Alcuni dati della tabella sono stati modificati.\r\n\r\nVuoi salvare?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
		{
			Salva_Click(sender, e);
		}
	}

	private void SelectedIndexChanged(object sender, EventArgs e)
	{
		IndexChanged = true;
	}

	private void Nome_SelectedIndexChanged(object sender, EventArgs e)
	{
		DescriptionText.Clear();
		CycleCanged(sender, e);
		Nome.Tag = Nome.Text;
		if (Nome.DropDownStyle != ComboBoxStyle.Simple && Nome.SelectedValue != null && !(Nome.SelectedValue.GetType() != typeof(int)))
		{
			ID_ABS = (int)Nome.SelectedValue;
			if (Nome.SelectedValue != null)
			{
				TestFault.Enabled = false;
				Application.DoEvents();
				TestFault.SelectedIndex = -1;
				TestFault.Enabled = true;
				Application.DoEvents();
				TestFault.SelectedIndex = 0;
			}
			else
			{
				ResetABS();
			}
		}
	}

	private void TestFaul_SelectedIndexChanged(object sender, EventArgs e)
	{
		CanaleFault.Enabled = false;
		CanaleFault.SelectedIndex = 0;
		CycleCanged(sender, e);
		TestFault.Tag = (sbyte)TestFault.SelectedIndex;
		if ((sbyte)TestFault.Tag == 0)
		{
			CanaleFault.SelectedIndex = 0;
			if (CodeABS == -1)
			{
				DescriptionText.Clear();
				LoadABS();
			}
		}
		else
		{
			CanaleFault.Enabled = true;
			CanaleFault.SelectedIndex = 1;
		}
	}

	private void CanaleFault_SelectedIndexChanged(object sender, EventArgs e)
	{
		CycleCanged(sender, e);
		CanaleFault.Tag = (sbyte)CanaleFault.SelectedIndex;
		if ((sbyte)TestFault.Tag > 0)
		{
			if ((sbyte)CanaleFault.Tag == 0)
			{
				CanaleFault.SelectedIndex = 1;
			}
			else if (CodeABS == -1)
			{
				DescriptionText.Clear();
				LoadABS();
			}
		}
	}

	private void ResetABS()
	{
		Cicli.Clear();
		foreach (Control control3 in base.Controls)
		{
			if (!(control3 is GroupBox) || control3.Name.IndexOf("Valvole") <= -1)
			{
				continue;
			}
			foreach (Control control4 in control3.Controls)
			{
				if (control4 is ComboBox)
				{
					((ComboBox)control4).SelectedValue = -1;
				}
			}
		}
	}

	private void Invia_Click(object sender, EventArgs e)
	{
		((FormHydraulicBench)base.Owner).Send.Stop();
		CheckData = true;
		Progressione = new Progress();
		Progressione.TopMost = true;
		Progressione.Show();
		FillParametri();
		List<int> list = new List<int>();
		string text = Serializer.Serialize(ABS.Values);
		list.Add(text.Length);
		BufferTX.Enqueue(text);
		text = Serializer.Serialize(ABS.Valves);
		list.Add(text.Length);
		BufferTX.Enqueue(text);
		foreach (ParametriTest item in ABS.Test)
		{
			text = Serializer.Serialize(item);
			list.Add(text.Length);
			BufferTX.Enqueue(text);
		}
		foreach (ParametriCiclo cicle in ABS.Cicles)
		{
			text = Serializer.Serialize(cicle);
			list.Add(text.Length);
			BufferTX.Enqueue(text);
		}
		foreach (ParametriCanale value in Canali.Values)
		{
			foreach (DataCanale datum in value.Data)
			{
				text = Serializer.Serialize(datum);
				list.Add(text.Length);
				BufferTX.Enqueue(text);
			}
		}
		Salva salva = new Salva(save: true);
		text = Serializer.Serialize(salva);
		list.Add(text.Length);
		BufferTX.Enqueue(text);
		Progressione.Status.Maximum = BufferTX.Count();
		foreach (Control control in base.Controls)
		{
			control.Enabled = false;
		}
		if (MainMenuForm.TestHydraulic > -1)
		{
			MainMenuForm.COM[MainMenuForm.TestHydraulic].DiscardInBuffer();
			MainMenuForm.COM[MainMenuForm.TestHydraulic].DiscardOutBuffer();
		}
		((FormHydraulicBench)base.Owner).Send.Start();
	}

	private void Terminal_Click(object sender, EventArgs e)
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

	private void FormHydraulicData_FormClosed(object sender, FormClosedEventArgs e)
	{
		Command.Connection.Close();
		if (Terminal != null)
		{
			Terminal.Dispose();
			Terminal = null;
		}
	}

	private void FormHydraulicData_FormClosing(object sender, FormClosingEventArgs e)
	{
		if (Progressione != null)
		{
			Progressione.Close();
			Progressione.Dispose();
			Progressione = null;
		}
	}

	private void Clear_Click(object sender, EventArgs e)
	{
		if (Terminal != null)
		{
			Terminal.Report.Text = "";
		}
	}

	private void Terminal_FormClosed(object sender, FormClosedEventArgs e)
	{
		Terminal.Dispose();
		Terminal = null;
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
			if (this.CyclesLoated != null)
			{
				this.CyclesLoated("Error: ABS data incorrect!!!");
			}
			else
			{
				MessageBox.Show("Error: Dati ABS non corretti.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			}
		}
		else if (this.CyclesLoated != null)
		{
			this.CyclesLoated("OK");
		}
		else
		{
			CodeABS = ABS.Values.CodiceABS;
			base.DialogResult = DialogResult.OK;
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
		List.Rows[RowIndex].Selected = true;
		List.CurrentCell = List.Rows[RowIndex].Cells[0];
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
		if (RowIndex != -1)
		{
			List.Rows[RowIndex].Selected = true;
			List.CurrentCell = List.Rows[RowIndex].Cells[0];
		}
	}

	private void Elimina_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Eliminare l'ABS?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
		{
			Command.Connection.Open();
			Command.CommandText = "DELETE FROM ABS WHERE ID = " + ID_ABS;
			Command.ExecuteNonQuery();
			Command.Connection.Close();
			Close();
		}
	}

	private void Invia_EnabledChanged(object sender, EventArgs e)
	{
	}

	private void Pos_SelectedIndexChanged(object sender, EventArgs e)
	{
		ComboBox comboBox = (ComboBox)sender;
		byte b = (byte)comboBox.Tag;
		comboBox.Tag = (byte)comboBox.SelectedIndex;
		ComboBox[] posizioni = Posizioni;
		foreach (ComboBox comboBox2 in posizioni)
		{
			if (!comboBox.Equals(comboBox2) && comboBox.SelectedIndex == comboBox2.SelectedIndex)
			{
				comboBox2.Tag = b;
				comboBox2.SelectedIndex = b;
				break;
			}
		}
	}

	private void FillSubCode()
	{
		object obj = null;
		DataTable dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT SubCode FROM ABS WHERE CodiceABS = " + CodiceABS.Text.Trim();
		if (ID_ABS != -1)
		{
			Command.Connection.Open();
			Command.CommandText = "SELECT CodiceABS FROM ABS WHERE ID = " + ID_ABS;
			obj = Command.ExecuteScalar();
			Command.Connection.Close();
			if (obj != null && obj.ToString() == CodiceABS.Text.Trim())
			{
				OleDbCommand selectCommand = Adapter.SelectCommand;
				selectCommand.CommandText = selectCommand.CommandText + " AND NOT SubCode = " + SubCodeText;
			}
		}
		Adapter.Fill(dataTable);
		for (byte b = 0; b < 10; b++)
		{
			if (dataTable.Rows.Count == 0 || dataTable.Select("SubCode = " + b).Length == 0)
			{
				txtSubCode.Text = b.ToString();
				break;
			}
		}
		if (obj != null && obj.ToString() == CodiceABS.Text.Trim())
		{
			txtSubCode.Text = SubCodeText;
		}
	}

	private void CodiceABS_MouseDown(object sender, MouseEventArgs e)
	{
		CodiceABS.Tag = CodiceABS.Text;
	}

	private void CodiceABS_TextChanged(object sender, EventArgs e)
	{
		if (!(CodiceABS.Text.Trim() == ""))
		{
			if (short.TryParse(CodiceABS.Text.Trim(), out var _))
			{
				FillSubCode();
				return;
			}
			MessageBox.Show("Error: Valore non valido!!!\r\n\r\nInserisci un codice valido.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			CodiceABS.Text = CodiceABS.Tag.ToString();
		}
	}

	private void CodiceABS_Validating(object sender, CancelEventArgs e)
	{
		if (short.TryParse(CodiceABS.Text.Trim(), out var _))
		{
			FillSubCode();
			return;
		}
		MessageBox.Show("Error: Valore non valido!!!\r\n\r\nInserisci un codice valido.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		CodiceABS.Text = CodiceABS.Tag.ToString();
		e.Cancel = true;
	}

	private void UpDateName_Click(object sender, EventArgs e)
	{
		Nome.DropDownStyle = ComboBoxStyle.Simple;
	}

	private void Duplica_Click(object sender, EventArgs e)
	{
		NewProduttoreForm newProduttoreForm = new NewProduttoreForm(select: false, "il produttore");
		newProduttoreForm.label1.Text = "Name ABS:";
		newProduttoreForm.Produttore.DropDownStyle = ComboBoxStyle.Simple;
		if (newProduttoreForm.ShowDialog() == DialogResult.OK)
		{
			IsChangingCycles = true;
			TestFault.SelectedIndex = 0;
			Sistem.Delay(100.0);
			IsNew = true;
			CodiceABS.Text = "0";
			Nome.DropDownStyle = ComboBoxStyle.Simple;
			NewName = newProduttoreForm.Produttore.Text;
			Salva_Click(Duplica, e);
			IsChangingCycles = false;
		}
		newProduttoreForm.Dispose();
		newProduttoreForm = null;
	}

	private void DuplicaCicles(int idabs)
	{
		int num = (int)Nome.SelectedValue;
		DataTable dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Cicli WHERE ID_ABS = " + idabs + " AND Test > 0 ORDER BY Ciclo, Test, Canale";
		Adapter.Fill(dataTable);
		string message;
		string query;
		foreach (DataRow row in dataTable.Rows)
		{
			query = "INSERT INTO Cicli ([ID_ABS], [Ciclo], [CP], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore], [Test], [Canale])\r\n                        SELECT " + (int)Nome.SelectedValue + " AS ID_ABS, [Ciclo], [CP], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore], [Test], [Canale] FROM Cicli\r\n                        WHERE ID = " + row["ID"]?.ToString() + " ORDER BY Test, Canale, Ciclo";
			if (!ExecuteQuery(query, out message))
			{
				throw new Exception(message);
			}
			Command.CommandText = "SELECT MAX(ID) FROM Cicli";
			query = "INSERT INTO ValvoleCicli ([ID_Cicli], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16])\r\n                        SELECT " + (int)Command.ExecuteScalar() + " AS ID_Cicli, [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16] FROM ValvoleCicli\r\n                        WHERE ID_Cicli = " + row["ID"];
			if (!ExecuteQuery(query, out message))
			{
				throw new Exception(message);
			}
		}
		query = "INSERT INTO Ripetizioni ([ID_ABS], [Test], [Canale], [Ripetizione])\r\n                        SELECT " + num + ", Test, Canale, Ripetizione FROM Ripetizioni\r\n                        WHERE ID_ABS = " + idabs + " AND Test > 0";
		if (!ExecuteQuery(query, out message))
		{
			throw new Exception(message);
		}
		query = "INSERT INTO TestValvole ([ID_ABS], [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16])\r\n                        SELECT " + num + " AS ID_ABS, [V1], [V2], [V3], [V4], [V5], [V6], [V7], [V8], [V9], [V10], [V11], [V12], [V13], [V14], [V15], [V16] FROM TestValvole\r\n                        WHERE ID_ABS = " + idabs;
		if (!ExecuteQuery(query, out message))
		{
			throw new Exception(message);
		}
	}

	private void Write_event(object sender)
	{
	}

	private void List_Leave(object sender, EventArgs e)
	{
		List.NotifyCurrentCellDirty(dirty: true);
		List.EndEdit();
		List.NotifyCurrentCellDirty(dirty: false);
		List.CommitEdit(DataGridViewDataErrorContexts.Commit);
		List.BindingContext[List.DataSource].EndCurrentEdit();
	}

	private void LoadABS()
	{
		IsChangingCycles = true;
		DataTable dataTable = new DataTable();
		foreach (Control control in base.Controls)
		{
			control.Enabled = true;
		}
		Invia.Enabled = ((FormHydraulicBench)base.Owner).Disconnect.ForeColor.ToArgb() == Color.Red.ToArgb();
		Val61.SelectedIndex = 0;
		Val62.SelectedIndex = 0;
		Val63.SelectedIndex = 0;
		Val64.SelectedIndex = 0;
		Val71.SelectedIndex = 0;
		Val72.SelectedIndex = 0;
		Val73.SelectedIndex = 0;
		Val74.SelectedIndex = 0;
		Val81.SelectedIndex = 0;
		Val82.SelectedIndex = 0;
		Val83.SelectedIndex = 0;
		Val84.SelectedIndex = 0;
		Canale61.Checked = false;
		Canale62.Checked = false;
		Canale63.Checked = false;
		Canale64.Checked = false;
		StopTest6.Checked = false;
		ControlloPressioni6.Checked = false;
		Canale71.Checked = false;
		Canale72.Checked = false;
		Canale73.Checked = false;
		Canale74.Checked = false;
		StopTest7.Checked = false;
		ControlloPressioni7.Checked = false;
		Canale81.Checked = false;
		Canale82.Checked = false;
		Canale83.Checked = false;
		Canale84.Checked = false;
		StopTest8.Checked = false;
		ControlloPressioni8.Checked = false;
		if (CodeABS > -1)
		{
			TestFault.SelectedIndex = TestFail;
			CanaleFault.SelectedIndex = ChannelFail;
			Command.CommandText = "SELECT ID FROM ABS WHERE CodiceABS = " + CodeABS + " AND SubCode = " + SubCode;
			Command.Connection.Open();
			ID_ABS = (int)Command.ExecuteScalar();
			Command.Connection.Close();
		}
		else
		{
			if (Nome.SelectedValue == null)
			{
				IsChangingCycles = false;
				return;
			}
			ID_ABS = (int)Nome.SelectedValue;
		}
		Nome.DropDownStyle = ComboBoxStyle.DropDownList;
		Adapter.SelectCommand.CommandText = "SELECT * FROM ABS WHERE ID = " + ID_ABS;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			CorrenteMax.Text = dataTable.Rows[0]["CorrenteMax"].ToString();
			CorrenteMin.Text = dataTable.Rows[0]["CorrenteMin"].ToString();
			AllarmeSup.Text = dataTable.Rows[0]["AllarmeSup"].ToString();
			AllarmeInf.Text = dataTable.Rows[0]["AllarmeInf"].ToString();
			PressioneMin.Text = dataTable.Rows[0]["PressioneMin"].ToString();
			PressioneMax.Text = dataTable.Rows[0]["PressioneMax"].ToString();
			PressioneLavoro.Text = dataTable.Rows[0]["PressioneLavoro"].ToString();
			PressioneInizializzazione.Text = dataTable.Rows[0]["PressioneInizializzazione"].ToString();
			PressioneBassa.Text = dataTable.Rows[0]["PressioneBassa"].ToString();
			PressioneRitorno.Text = dataTable.Rows[0]["PressioneRitorno"].ToString();
			Pulse4.Text = dataTable.Rows[0]["Pulse4"].ToString();
			Pulse5.Text = dataTable.Rows[0]["Pulse5"].ToString();
			SubCodeText = dataTable.Rows[0]["SubCode"].ToString();
			CodiceABS.Text = dataTable.Rows[0]["CodiceABS"].ToString();
			Temperatura.Text = dataTable.Rows[0]["Temperatura"].ToString();
			Resistenza.Text = dataTable.Rows[0]["Resistenza"].ToString();
			if ((byte)dataTable.Rows[0]["TipoTest3"] != byte.MaxValue && (byte)dataTable.Rows[0]["TipoTest3"] < 2)
			{
				TypeTest3.SelectedIndex = (byte)dataTable.Rows[0]["TipoTest3"];
			}
			bool flag = Command.Connection.State == ConnectionState.Closed;
			if (flag)
			{
				Command.Connection.Open();
			}
			Command.CommandText = "SELECT Ripetizione FROM Ripetizioni WHERE ID_ABS = " + ID_ABS + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag;
			object obj = Command.ExecuteScalar();
			if (obj != null)
			{
				RipetizioneCiclo.Text = obj.ToString();
			}
			else
			{
				RipetizioneCiclo.Text = 7.ToString();
			}
			if (flag)
			{
				Command.Connection.Close();
			}
		}
		dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT * FROM OrdineTest WHERE ID_ABS = " + ID_ABS;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b = 1; b <= 8; b++)
			{
				string columnName = "Pos" + b;
				string key = "Pos" + b;
				string key2 = "Test" + b;
				GroupBox groupBox = (GroupBox)base.Controls[key2];
				((ComboBox)groupBox.Controls[key]).SelectedIndex = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
		}
		dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT * FROM TestValvole WHERE ID_ABS = " + ID_ABS;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b2 = 1; b2 <= 16; b2++)
			{
				string columnName = "V" + b2;
				string key = "TestvV" + b2;
				((ComboBox)TestValvole.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 1;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b3 = 1; b3 <= 16; b3++)
			{
				string columnName = "V" + b3;
				string key = "Test1V" + b3;
				((ComboBox)Valvole1.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo1.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(1, Testo1.Text);
			Canale11.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale12.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale13.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale14.Checked = (bool)dataTable.Rows[0]["E4"];
			Val11.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val12.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val13.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val14.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			StopTest1.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 2;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b4 = 1; b4 <= 16; b4++)
			{
				string columnName = "V" + b4;
				string key = "Test2V" + b4;
				((ComboBox)Valvole2.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo2.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(2, Testo2.Text);
			Canale21.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale22.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale23.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale24.Checked = (bool)dataTable.Rows[0]["E4"];
			Val21.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val22.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val23.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val24.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			StopTest2.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 3;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b5 = 1; b5 <= 16; b5++)
			{
				string columnName = "V" + b5;
				string key = "Test3V" + b5;
				((ComboBox)Valvole3.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo3.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(3, Testo3.Text);
			Canale31.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale32.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale33.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale34.Checked = (bool)dataTable.Rows[0]["E4"];
			Val31.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val32.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val33.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val34.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			StopTest3.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 4;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b6 = 1; b6 <= 16; b6++)
			{
				string columnName = "V" + b6;
				string key = "Test4V" + b6;
				((ComboBox)Valvole4.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo4.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(4, Testo4.Text);
			Canale41.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale42.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale43.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale44.Checked = (bool)dataTable.Rows[0]["E4"];
			Val41.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val42.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val43.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val44.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			ControlloPressioni4.Checked = (bool)dataTable.Rows[0]["C"];
			StopTest4.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 5;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b7 = 1; b7 <= 16; b7++)
			{
				string columnName = "V" + b7;
				string key = "Test5V" + b7;
				((ComboBox)Valvole5.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo5.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(5, Testo5.Text);
			Canale51.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale52.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale53.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale54.Checked = (bool)dataTable.Rows[0]["E4"];
			Val51.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val52.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val53.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val54.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			ControlloPressioni5.Checked = (bool)dataTable.Rows[0]["C"];
			StopTest5.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 6;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b8 = 1; b8 <= 16; b8++)
			{
				string columnName = "V" + b8;
				string key = "Test6V" + b8;
				((ComboBox)Valvole6.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo6.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(6, Testo6.Text);
			Canale61.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale62.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale63.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale64.Checked = (bool)dataTable.Rows[0]["E4"];
			Val61.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val62.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val63.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val64.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			ControlloPressioni6.Checked = (bool)dataTable.Rows[0]["C"];
			StopTest6.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 7;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b9 = 1; b9 <= 16; b9++)
			{
				string columnName = "V" + b9;
				string key = "Test7V" + b9;
				((ComboBox)Valvole7.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo7.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(7, Testo7.Text);
			Canale71.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale72.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale73.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale74.Checked = (bool)dataTable.Rows[0]["E4"];
			Val71.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val72.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val73.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val74.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			ControlloPressioni7.Checked = (bool)dataTable.Rows[0]["C"];
			StopTest7.Checked = (bool)dataTable.Rows[0]["S"];
		}
		dataTable.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Test INNER JOIN ValvoleTest ON Test.ID = ValvoleTest.ID_Test WHERE ID_ABS = " + ID_ABS + " AND [Test] = " + 8;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			for (byte b10 = 1; b10 <= 16; b10++)
			{
				string columnName = "V" + b10;
				string key = "Test8V" + b10;
				((ComboBox)Valvole8.Controls[key]).SelectedValue = (sbyte)(byte)dataTable.Rows[0][columnName];
			}
			if (dataTable.Rows[0]["Descrizione"] != DBNull.Value)
			{
				Testo8.Text = dataTable.Rows[0]["Descrizione"].ToString();
			}
			DescriptionText.Add(8, Testo8.Text);
			Canale81.Checked = (bool)dataTable.Rows[0]["E1"];
			Canale82.Checked = (bool)dataTable.Rows[0]["E2"];
			Canale83.Checked = (bool)dataTable.Rows[0]["E3"];
			Canale84.Checked = (bool)dataTable.Rows[0]["E4"];
			Val81.SelectedIndex = (byte)dataTable.Rows[0]["T1"];
			Val82.SelectedIndex = (byte)dataTable.Rows[0]["T2"];
			Val83.SelectedIndex = (byte)dataTable.Rows[0]["T3"];
			Val84.SelectedIndex = (byte)dataTable.Rows[0]["T4"];
			ControlloPressioni8.Checked = (bool)dataTable.Rows[0]["C"];
			StopTest8.Checked = (bool)dataTable.Rows[0]["S"];
		}
		List.RowsAdded -= List_RowsAdded;
		Cicli.Clear();
		Adapter.SelectCommand.CommandText = "SELECT Ciclo AS ID, Pressione, Impulso AS Pausa,\r\n                                                    IIf(ValvoleCicli.V1<128, ValvoleCicli.V1, -1) AS V1,\r\n                                                    IIf(ValvoleCicli.V2<128, ValvoleCicli.V2, -1) AS V2,\r\n                                                    IIf(ValvoleCicli.V3<128, ValvoleCicli.V3, -1) AS V3,\r\n                                                    IIf(ValvoleCicli.V4<128, ValvoleCicli.V4, -1) AS V4,\r\n                                                    IIf(ValvoleCicli.V5<128, ValvoleCicli.V5, -1) AS V5,\r\n                                                    IIf(ValvoleCicli.V6<128, ValvoleCicli.V6, -1) AS V6,\r\n                                                    IIf(ValvoleCicli.V7<128, ValvoleCicli.V7, -1) AS V7,\r\n                                                    IIf(ValvoleCicli.V8<128, ValvoleCicli.V8, -1) AS V8,\r\n                                                    IIf(ValvoleCicli.V9<128, ValvoleCicli.V9, -1) AS V9,\r\n                                                    IIf(ValvoleCicli.V10<128, ValvoleCicli.V10, -1) AS V10,\r\n                                                    IIf(ValvoleCicli.V11<128, ValvoleCicli.V11, -1) AS V11,\r\n                                                    IIf(ValvoleCicli.V12<128, ValvoleCicli.V12, -1) AS V12,\r\n                                                    IIf(ValvoleCicli.V13<128, ValvoleCicli.V13, -1) AS V13,\r\n                                                    IIf(ValvoleCicli.V14<128, ValvoleCicli.V14, -1) AS V14,\r\n                                                    IIf(ValvoleCicli.V15<128, ValvoleCicli.V15, -1) AS V15,\r\n                                                    IIf(ValvoleCicli.V16<128, ValvoleCicli.V16, -1) AS V16,\r\n                                                    CP, Impulsi, Pompa, Motore\r\n                                                FROM Cicli INNER JOIN ValvoleCicli ON Cicli.ID = ValvoleCicli.ID_Cicli\r\n                                                WHERE ID_ABS = " + ID_ABS + " AND Test = " + (sbyte)TestFault.Tag + " AND Canale = " + (sbyte)CanaleFault.Tag + " ORDER BY Cicli.Ciclo";
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
		Sistem.Delay(100.0);
		IsChangingCycles = false;
		IndexChanged = false;
		foreach (DataRow row in Cicli.Rows)
		{
			row.AcceptChanges();
		}
		List.RowsAdded += List_RowsAdded;
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
		this.PressioneMax = new System.Windows.Forms.TextBox();
		this.Test2V1 = new System.Windows.Forms.ComboBox();
		this.Test2V2 = new System.Windows.Forms.ComboBox();
		this.Test2V3 = new System.Windows.Forms.ComboBox();
		this.Test2V4 = new System.Windows.Forms.ComboBox();
		this.Test2V5 = new System.Windows.Forms.ComboBox();
		this.Test2V6 = new System.Windows.Forms.ComboBox();
		this.Test2V7 = new System.Windows.Forms.ComboBox();
		this.Test2V8 = new System.Windows.Forms.ComboBox();
		this.Test2V9 = new System.Windows.Forms.ComboBox();
		this.Test2V10 = new System.Windows.Forms.ComboBox();
		this.Test2V11 = new System.Windows.Forms.ComboBox();
		this.Test2V12 = new System.Windows.Forms.ComboBox();
		this.Valvole2 = new System.Windows.Forms.GroupBox();
		this.Test2V16 = new System.Windows.Forms.ComboBox();
		this.Test2V15 = new System.Windows.Forms.ComboBox();
		this.Test2V14 = new System.Windows.Forms.ComboBox();
		this.Test2V13 = new System.Windows.Forms.ComboBox();
		this.Valvole3 = new System.Windows.Forms.GroupBox();
		this.Test3V16 = new System.Windows.Forms.ComboBox();
		this.Test3V13 = new System.Windows.Forms.ComboBox();
		this.Test3V15 = new System.Windows.Forms.ComboBox();
		this.Test3V12 = new System.Windows.Forms.ComboBox();
		this.Test3V14 = new System.Windows.Forms.ComboBox();
		this.Test3V1 = new System.Windows.Forms.ComboBox();
		this.Test3V2 = new System.Windows.Forms.ComboBox();
		this.Test3V3 = new System.Windows.Forms.ComboBox();
		this.Test3V4 = new System.Windows.Forms.ComboBox();
		this.Test3V5 = new System.Windows.Forms.ComboBox();
		this.Test3V6 = new System.Windows.Forms.ComboBox();
		this.Test3V7 = new System.Windows.Forms.ComboBox();
		this.Test3V8 = new System.Windows.Forms.ComboBox();
		this.Test3V9 = new System.Windows.Forms.ComboBox();
		this.Test3V10 = new System.Windows.Forms.ComboBox();
		this.Test3V11 = new System.Windows.Forms.ComboBox();
		this.StopTest3 = new System.Windows.Forms.CheckBox();
		this.Valvole4 = new System.Windows.Forms.GroupBox();
		this.Test4V16 = new System.Windows.Forms.ComboBox();
		this.Test4V15 = new System.Windows.Forms.ComboBox();
		this.Test4V14 = new System.Windows.Forms.ComboBox();
		this.Test4V13 = new System.Windows.Forms.ComboBox();
		this.Test4V12 = new System.Windows.Forms.ComboBox();
		this.Test4V1 = new System.Windows.Forms.ComboBox();
		this.Test4V2 = new System.Windows.Forms.ComboBox();
		this.Test4V3 = new System.Windows.Forms.ComboBox();
		this.Test4V4 = new System.Windows.Forms.ComboBox();
		this.Test4V5 = new System.Windows.Forms.ComboBox();
		this.Test4V6 = new System.Windows.Forms.ComboBox();
		this.Test4V7 = new System.Windows.Forms.ComboBox();
		this.Test4V8 = new System.Windows.Forms.ComboBox();
		this.Test4V9 = new System.Windows.Forms.ComboBox();
		this.Test4V10 = new System.Windows.Forms.ComboBox();
		this.Test4V11 = new System.Windows.Forms.ComboBox();
		this.StopTest4 = new System.Windows.Forms.CheckBox();
		this.Valvole5 = new System.Windows.Forms.GroupBox();
		this.Test5V16 = new System.Windows.Forms.ComboBox();
		this.Test5V15 = new System.Windows.Forms.ComboBox();
		this.Test5V14 = new System.Windows.Forms.ComboBox();
		this.Test5V13 = new System.Windows.Forms.ComboBox();
		this.Test5V12 = new System.Windows.Forms.ComboBox();
		this.Test5V1 = new System.Windows.Forms.ComboBox();
		this.Test5V2 = new System.Windows.Forms.ComboBox();
		this.Test5V3 = new System.Windows.Forms.ComboBox();
		this.Test5V4 = new System.Windows.Forms.ComboBox();
		this.Test5V5 = new System.Windows.Forms.ComboBox();
		this.Test5V6 = new System.Windows.Forms.ComboBox();
		this.Test5V7 = new System.Windows.Forms.ComboBox();
		this.Test5V8 = new System.Windows.Forms.ComboBox();
		this.Test5V9 = new System.Windows.Forms.ComboBox();
		this.Test5V10 = new System.Windows.Forms.ComboBox();
		this.Test5V11 = new System.Windows.Forms.ComboBox();
		this.StopTest5 = new System.Windows.Forms.CheckBox();
		this.List = new System.Windows.Forms.DataGridView();
		this.ID = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.CP = new System.Windows.Forms.DataGridViewComboBoxColumn();
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
		this.label1 = new System.Windows.Forms.Label();
		this.label2 = new System.Windows.Forms.Label();
		this.AllarmeSup = new System.Windows.Forms.TextBox();
		this.label3 = new System.Windows.Forms.Label();
		this.Pulse5 = new System.Windows.Forms.TextBox();
		this.label4 = new System.Windows.Forms.Label();
		this.Pulse4 = new System.Windows.Forms.TextBox();
		this.Cmp41 = new System.Windows.Forms.Label();
		this.Test4 = new System.Windows.Forms.GroupBox();
		this.label28 = new System.Windows.Forms.Label();
		this.Pos4 = new System.Windows.Forms.ComboBox();
		this.Testo4 = new System.Windows.Forms.TextBox();
		this.ControlloPressioni4 = new System.Windows.Forms.CheckBox();
		this.Val44 = new System.Windows.Forms.ComboBox();
		this.Val43 = new System.Windows.Forms.ComboBox();
		this.Val42 = new System.Windows.Forms.ComboBox();
		this.Canale44 = new System.Windows.Forms.CheckBox();
		this.Canale43 = new System.Windows.Forms.CheckBox();
		this.Canale42 = new System.Windows.Forms.CheckBox();
		this.Val41 = new System.Windows.Forms.ComboBox();
		this.Canale41 = new System.Windows.Forms.CheckBox();
		this.Cmp44 = new System.Windows.Forms.Label();
		this.Cmp43 = new System.Windows.Forms.Label();
		this.Cmp42 = new System.Windows.Forms.Label();
		this.Test5 = new System.Windows.Forms.GroupBox();
		this.label25 = new System.Windows.Forms.Label();
		this.Pos5 = new System.Windows.Forms.ComboBox();
		this.Testo5 = new System.Windows.Forms.TextBox();
		this.ControlloPressioni5 = new System.Windows.Forms.CheckBox();
		this.Val54 = new System.Windows.Forms.ComboBox();
		this.Val53 = new System.Windows.Forms.ComboBox();
		this.Val52 = new System.Windows.Forms.ComboBox();
		this.Canale54 = new System.Windows.Forms.CheckBox();
		this.Canale53 = new System.Windows.Forms.CheckBox();
		this.Canale52 = new System.Windows.Forms.CheckBox();
		this.Val51 = new System.Windows.Forms.ComboBox();
		this.Canale51 = new System.Windows.Forms.CheckBox();
		this.Cmp54 = new System.Windows.Forms.Label();
		this.Cmp53 = new System.Windows.Forms.Label();
		this.Cmp52 = new System.Windows.Forms.Label();
		this.Cmp51 = new System.Windows.Forms.Label();
		this.Salva = new System.Windows.Forms.Button();
		this.Chiudi = new System.Windows.Forms.Button();
		this.Invia = new System.Windows.Forms.Button();
		this.label5 = new System.Windows.Forms.Label();
		this.Nome = new System.Windows.Forms.ComboBox();
		this.label6 = new System.Windows.Forms.Label();
		this.PressioneMin = new System.Windows.Forms.TextBox();
		this.Test3 = new System.Windows.Forms.GroupBox();
		this.label24 = new System.Windows.Forms.Label();
		this.Pos3 = new System.Windows.Forms.ComboBox();
		this.Testo3 = new System.Windows.Forms.TextBox();
		this.TypeTest3 = new System.Windows.Forms.ComboBox();
		this.label15 = new System.Windows.Forms.Label();
		this.Val34 = new System.Windows.Forms.ComboBox();
		this.Val33 = new System.Windows.Forms.ComboBox();
		this.Val32 = new System.Windows.Forms.ComboBox();
		this.Canale34 = new System.Windows.Forms.CheckBox();
		this.Canale33 = new System.Windows.Forms.CheckBox();
		this.Canale32 = new System.Windows.Forms.CheckBox();
		this.Val31 = new System.Windows.Forms.ComboBox();
		this.Canale31 = new System.Windows.Forms.CheckBox();
		this.label7 = new System.Windows.Forms.Label();
		this.label8 = new System.Windows.Forms.Label();
		this.label9 = new System.Windows.Forms.Label();
		this.label10 = new System.Windows.Forms.Label();
		this.label11 = new System.Windows.Forms.Label();
		this.AllarmeInf = new System.Windows.Forms.TextBox();
		this.label12 = new System.Windows.Forms.Label();
		this.CorrenteMin = new System.Windows.Forms.TextBox();
		this.label13 = new System.Windows.Forms.Label();
		this.CorrenteMax = new System.Windows.Forms.TextBox();
		this.btnTerminal = new System.Windows.Forms.Button();
		this.Clear = new System.Windows.Forms.Button();
		this.TimeOut = new System.Windows.Forms.Timer(this.components);
		this.Duplica = new System.Windows.Forms.Button();
		this.Elimina = new System.Windows.Forms.Button();
		this.Test1 = new System.Windows.Forms.GroupBox();
		this.label23 = new System.Windows.Forms.Label();
		this.Pos1 = new System.Windows.Forms.ComboBox();
		this.Testo1 = new System.Windows.Forms.TextBox();
		this.Val14 = new System.Windows.Forms.ComboBox();
		this.Val13 = new System.Windows.Forms.ComboBox();
		this.Val12 = new System.Windows.Forms.ComboBox();
		this.Val11 = new System.Windows.Forms.ComboBox();
		this.Cmp14 = new System.Windows.Forms.Label();
		this.Cmp13 = new System.Windows.Forms.Label();
		this.Cmp12 = new System.Windows.Forms.Label();
		this.Cmp11 = new System.Windows.Forms.Label();
		this.StopTest1 = new System.Windows.Forms.CheckBox();
		this.Canale14 = new System.Windows.Forms.CheckBox();
		this.Canale13 = new System.Windows.Forms.CheckBox();
		this.Canale12 = new System.Windows.Forms.CheckBox();
		this.Canale11 = new System.Windows.Forms.CheckBox();
		this.label18 = new System.Windows.Forms.Label();
		this.PressioneLavoro = new System.Windows.Forms.TextBox();
		this.label19 = new System.Windows.Forms.Label();
		this.txtSubCode = new System.Windows.Forms.TextBox();
		this.label14 = new System.Windows.Forms.Label();
		this.CodiceABS = new System.Windows.Forms.TextBox();
		this.UpDateName = new System.Windows.Forms.Button();
		this.Test6 = new System.Windows.Forms.GroupBox();
		this.label29 = new System.Windows.Forms.Label();
		this.Pos6 = new System.Windows.Forms.ComboBox();
		this.Testo6 = new System.Windows.Forms.TextBox();
		this.StopTest6 = new System.Windows.Forms.CheckBox();
		this.ControlloPressioni6 = new System.Windows.Forms.CheckBox();
		this.Val64 = new System.Windows.Forms.ComboBox();
		this.Val63 = new System.Windows.Forms.ComboBox();
		this.Val62 = new System.Windows.Forms.ComboBox();
		this.Canale64 = new System.Windows.Forms.CheckBox();
		this.Canale63 = new System.Windows.Forms.CheckBox();
		this.Canale62 = new System.Windows.Forms.CheckBox();
		this.Val61 = new System.Windows.Forms.ComboBox();
		this.Canale61 = new System.Windows.Forms.CheckBox();
		this.Cmp64 = new System.Windows.Forms.Label();
		this.Cmp63 = new System.Windows.Forms.Label();
		this.Cmp62 = new System.Windows.Forms.Label();
		this.Cmp61 = new System.Windows.Forms.Label();
		this.Valvole6 = new System.Windows.Forms.GroupBox();
		this.Test6V16 = new System.Windows.Forms.ComboBox();
		this.Test6V15 = new System.Windows.Forms.ComboBox();
		this.Test6V14 = new System.Windows.Forms.ComboBox();
		this.Test6V13 = new System.Windows.Forms.ComboBox();
		this.Test6V12 = new System.Windows.Forms.ComboBox();
		this.Test6V1 = new System.Windows.Forms.ComboBox();
		this.Test6V2 = new System.Windows.Forms.ComboBox();
		this.Test6V3 = new System.Windows.Forms.ComboBox();
		this.Test6V4 = new System.Windows.Forms.ComboBox();
		this.Test6V5 = new System.Windows.Forms.ComboBox();
		this.Test6V6 = new System.Windows.Forms.ComboBox();
		this.Test6V7 = new System.Windows.Forms.ComboBox();
		this.Test6V8 = new System.Windows.Forms.ComboBox();
		this.Test6V9 = new System.Windows.Forms.ComboBox();
		this.Test6V10 = new System.Windows.Forms.ComboBox();
		this.Test6V11 = new System.Windows.Forms.ComboBox();
		this.Valvole7 = new System.Windows.Forms.GroupBox();
		this.Test7V16 = new System.Windows.Forms.ComboBox();
		this.Test7V15 = new System.Windows.Forms.ComboBox();
		this.Test7V14 = new System.Windows.Forms.ComboBox();
		this.Test7V13 = new System.Windows.Forms.ComboBox();
		this.Test7V12 = new System.Windows.Forms.ComboBox();
		this.Test7V1 = new System.Windows.Forms.ComboBox();
		this.Test7V2 = new System.Windows.Forms.ComboBox();
		this.Test7V3 = new System.Windows.Forms.ComboBox();
		this.Test7V4 = new System.Windows.Forms.ComboBox();
		this.Test7V5 = new System.Windows.Forms.ComboBox();
		this.Test7V6 = new System.Windows.Forms.ComboBox();
		this.Test7V7 = new System.Windows.Forms.ComboBox();
		this.Test7V8 = new System.Windows.Forms.ComboBox();
		this.Test7V9 = new System.Windows.Forms.ComboBox();
		this.Test7V10 = new System.Windows.Forms.ComboBox();
		this.Test7V11 = new System.Windows.Forms.ComboBox();
		this.Valvole8 = new System.Windows.Forms.GroupBox();
		this.Test8V16 = new System.Windows.Forms.ComboBox();
		this.Test8V15 = new System.Windows.Forms.ComboBox();
		this.Test8V14 = new System.Windows.Forms.ComboBox();
		this.Test8V13 = new System.Windows.Forms.ComboBox();
		this.Test8V12 = new System.Windows.Forms.ComboBox();
		this.Test8V1 = new System.Windows.Forms.ComboBox();
		this.Test8V2 = new System.Windows.Forms.ComboBox();
		this.Test8V3 = new System.Windows.Forms.ComboBox();
		this.Test8V4 = new System.Windows.Forms.ComboBox();
		this.Test8V5 = new System.Windows.Forms.ComboBox();
		this.Test8V6 = new System.Windows.Forms.ComboBox();
		this.Test8V7 = new System.Windows.Forms.ComboBox();
		this.Test8V8 = new System.Windows.Forms.ComboBox();
		this.Test8V9 = new System.Windows.Forms.ComboBox();
		this.Test8V10 = new System.Windows.Forms.ComboBox();
		this.Test8V11 = new System.Windows.Forms.ComboBox();
		this.Test8 = new System.Windows.Forms.GroupBox();
		this.label30 = new System.Windows.Forms.Label();
		this.Pos8 = new System.Windows.Forms.ComboBox();
		this.Testo8 = new System.Windows.Forms.TextBox();
		this.StopTest8 = new System.Windows.Forms.CheckBox();
		this.ControlloPressioni8 = new System.Windows.Forms.CheckBox();
		this.Val84 = new System.Windows.Forms.ComboBox();
		this.Val83 = new System.Windows.Forms.ComboBox();
		this.Val82 = new System.Windows.Forms.ComboBox();
		this.Canale84 = new System.Windows.Forms.CheckBox();
		this.Canale83 = new System.Windows.Forms.CheckBox();
		this.Canale82 = new System.Windows.Forms.CheckBox();
		this.Val81 = new System.Windows.Forms.ComboBox();
		this.Canale81 = new System.Windows.Forms.CheckBox();
		this.Cmp84 = new System.Windows.Forms.Label();
		this.Cmp83 = new System.Windows.Forms.Label();
		this.Cmp82 = new System.Windows.Forms.Label();
		this.Cmp81 = new System.Windows.Forms.Label();
		this.Test7 = new System.Windows.Forms.GroupBox();
		this.label26 = new System.Windows.Forms.Label();
		this.Pos7 = new System.Windows.Forms.ComboBox();
		this.Testo7 = new System.Windows.Forms.TextBox();
		this.StopTest7 = new System.Windows.Forms.CheckBox();
		this.ControlloPressioni7 = new System.Windows.Forms.CheckBox();
		this.Val74 = new System.Windows.Forms.ComboBox();
		this.Val73 = new System.Windows.Forms.ComboBox();
		this.Val72 = new System.Windows.Forms.ComboBox();
		this.Canale74 = new System.Windows.Forms.CheckBox();
		this.Canale73 = new System.Windows.Forms.CheckBox();
		this.Canale72 = new System.Windows.Forms.CheckBox();
		this.Val71 = new System.Windows.Forms.ComboBox();
		this.Canale71 = new System.Windows.Forms.CheckBox();
		this.Cmp74 = new System.Windows.Forms.Label();
		this.Cmp73 = new System.Windows.Forms.Label();
		this.Cmp72 = new System.Windows.Forms.Label();
		this.Cmp71 = new System.Windows.Forms.Label();
		this.label20 = new System.Windows.Forms.Label();
		this.PressioneInizializzazione = new System.Windows.Forms.TextBox();
		this.TestFault = new System.Windows.Forms.ComboBox();
		this.CanaleFault = new System.Windows.Forms.ComboBox();
		this.label16 = new System.Windows.Forms.Label();
		this.label17 = new System.Windows.Forms.Label();
		this.label21 = new System.Windows.Forms.Label();
		this.Temperatura = new System.Windows.Forms.TextBox();
		this.label22 = new System.Windows.Forms.Label();
		this.Resistenza = new System.Windows.Forms.TextBox();
		this.Valvole1 = new System.Windows.Forms.GroupBox();
		this.Test1V16 = new System.Windows.Forms.ComboBox();
		this.Test1V15 = new System.Windows.Forms.ComboBox();
		this.Test1V14 = new System.Windows.Forms.ComboBox();
		this.Test1V13 = new System.Windows.Forms.ComboBox();
		this.Test1V12 = new System.Windows.Forms.ComboBox();
		this.Test1V1 = new System.Windows.Forms.ComboBox();
		this.Test1V2 = new System.Windows.Forms.ComboBox();
		this.Test1V3 = new System.Windows.Forms.ComboBox();
		this.Test1V4 = new System.Windows.Forms.ComboBox();
		this.Test1V5 = new System.Windows.Forms.ComboBox();
		this.Test1V6 = new System.Windows.Forms.ComboBox();
		this.Test1V7 = new System.Windows.Forms.ComboBox();
		this.Test1V8 = new System.Windows.Forms.ComboBox();
		this.Test1V9 = new System.Windows.Forms.ComboBox();
		this.Test1V10 = new System.Windows.Forms.ComboBox();
		this.Test1V11 = new System.Windows.Forms.ComboBox();
		this.Canale23 = new System.Windows.Forms.CheckBox();
		this.Canale22 = new System.Windows.Forms.CheckBox();
		this.Canale21 = new System.Windows.Forms.CheckBox();
		this.Canale24 = new System.Windows.Forms.CheckBox();
		this.StopTest2 = new System.Windows.Forms.CheckBox();
		this.Test2 = new System.Windows.Forms.GroupBox();
		this.label27 = new System.Windows.Forms.Label();
		this.Pos2 = new System.Windows.Forms.ComboBox();
		this.Testo2 = new System.Windows.Forms.TextBox();
		this.Val24 = new System.Windows.Forms.ComboBox();
		this.Val23 = new System.Windows.Forms.ComboBox();
		this.Val22 = new System.Windows.Forms.ComboBox();
		this.Val21 = new System.Windows.Forms.ComboBox();
		this.Cmp24 = new System.Windows.Forms.Label();
		this.Cmp23 = new System.Windows.Forms.Label();
		this.Cmp22 = new System.Windows.Forms.Label();
		this.Cmp21 = new System.Windows.Forms.Label();
		this.TestValvole = new System.Windows.Forms.GroupBox();
		this.TestvV16 = new System.Windows.Forms.ComboBox();
		this.TestvV15 = new System.Windows.Forms.ComboBox();
		this.TestvV14 = new System.Windows.Forms.ComboBox();
		this.TestvV13 = new System.Windows.Forms.ComboBox();
		this.TestvV12 = new System.Windows.Forms.ComboBox();
		this.TestvV1 = new System.Windows.Forms.ComboBox();
		this.TestvV2 = new System.Windows.Forms.ComboBox();
		this.TestvV3 = new System.Windows.Forms.ComboBox();
		this.TestvV4 = new System.Windows.Forms.ComboBox();
		this.TestvV5 = new System.Windows.Forms.ComboBox();
		this.TestvV6 = new System.Windows.Forms.ComboBox();
		this.TestvV7 = new System.Windows.Forms.ComboBox();
		this.TestvV8 = new System.Windows.Forms.ComboBox();
		this.TestvV9 = new System.Windows.Forms.ComboBox();
		this.TestvV10 = new System.Windows.Forms.ComboBox();
		this.TestvV11 = new System.Windows.Forms.ComboBox();
		this.label31 = new System.Windows.Forms.Label();
		this.PressioneRitorno = new System.Windows.Forms.TextBox();
		this.label32 = new System.Windows.Forms.Label();
		this.PressioneBassa = new System.Windows.Forms.TextBox();
		this.label33 = new System.Windows.Forms.Label();
		this.RipetizioneCiclo = new System.Windows.Forms.TextBox();
		this.Valvole2.SuspendLayout();
		this.Valvole3.SuspendLayout();
		this.Valvole4.SuspendLayout();
		this.Valvole5.SuspendLayout();
		((System.ComponentModel.ISupportInitialize)this.List).BeginInit();
		this.Test4.SuspendLayout();
		this.Test5.SuspendLayout();
		this.Test3.SuspendLayout();
		this.Test1.SuspendLayout();
		this.Test6.SuspendLayout();
		this.Valvole6.SuspendLayout();
		this.Valvole7.SuspendLayout();
		this.Valvole8.SuspendLayout();
		this.Test8.SuspendLayout();
		this.Test7.SuspendLayout();
		this.Valvole1.SuspendLayout();
		this.Test2.SuspendLayout();
		this.TestValvole.SuspendLayout();
		base.SuspendLayout();
		this.PressioneMax.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneMax.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneMax.Location = new System.Drawing.Point(1620, 778);
		this.PressioneMax.Name = "PressioneMax";
		this.PressioneMax.Size = new System.Drawing.Size(45, 22);
		this.PressioneMax.TabIndex = 8;
		this.PressioneMax.Text = "200";
		this.PressioneMax.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.PressioneMax.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.PressioneMax.Validating += new System.ComponentModel.CancelEventHandler(Validating_Short);
		this.Test2V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V1.FormattingEnabled = true;
		this.Test2V1.Location = new System.Drawing.Point(6, 26);
		this.Test2V1.Name = "Test2V1";
		this.Test2V1.Size = new System.Drawing.Size(43, 21);
		this.Test2V1.TabIndex = 1;
		this.Test2V1.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V2.FormattingEnabled = true;
		this.Test2V2.Location = new System.Drawing.Point(56, 26);
		this.Test2V2.Name = "Test2V2";
		this.Test2V2.Size = new System.Drawing.Size(43, 21);
		this.Test2V2.TabIndex = 2;
		this.Test2V2.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V3.FormattingEnabled = true;
		this.Test2V3.Location = new System.Drawing.Point(106, 26);
		this.Test2V3.Name = "Test2V3";
		this.Test2V3.Size = new System.Drawing.Size(43, 21);
		this.Test2V3.TabIndex = 3;
		this.Test2V3.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V4.FormattingEnabled = true;
		this.Test2V4.Location = new System.Drawing.Point(156, 26);
		this.Test2V4.Name = "Test2V4";
		this.Test2V4.Size = new System.Drawing.Size(43, 21);
		this.Test2V4.TabIndex = 4;
		this.Test2V4.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V5.FormattingEnabled = true;
		this.Test2V5.Location = new System.Drawing.Point(206, 26);
		this.Test2V5.Name = "Test2V5";
		this.Test2V5.Size = new System.Drawing.Size(43, 21);
		this.Test2V5.TabIndex = 5;
		this.Test2V5.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V6.FormattingEnabled = true;
		this.Test2V6.Location = new System.Drawing.Point(256, 26);
		this.Test2V6.Name = "Test2V6";
		this.Test2V6.Size = new System.Drawing.Size(43, 21);
		this.Test2V6.TabIndex = 6;
		this.Test2V6.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V7.FormattingEnabled = true;
		this.Test2V7.Location = new System.Drawing.Point(306, 26);
		this.Test2V7.Name = "Test2V7";
		this.Test2V7.Size = new System.Drawing.Size(43, 21);
		this.Test2V7.TabIndex = 7;
		this.Test2V7.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V8.FormattingEnabled = true;
		this.Test2V8.Location = new System.Drawing.Point(356, 26);
		this.Test2V8.Name = "Test2V8";
		this.Test2V8.Size = new System.Drawing.Size(43, 21);
		this.Test2V8.TabIndex = 8;
		this.Test2V8.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V9.FormattingEnabled = true;
		this.Test2V9.Location = new System.Drawing.Point(406, 26);
		this.Test2V9.Name = "Test2V9";
		this.Test2V9.Size = new System.Drawing.Size(43, 21);
		this.Test2V9.TabIndex = 9;
		this.Test2V9.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V10.FormattingEnabled = true;
		this.Test2V10.Location = new System.Drawing.Point(456, 26);
		this.Test2V10.Name = "Test2V10";
		this.Test2V10.Size = new System.Drawing.Size(43, 21);
		this.Test2V10.TabIndex = 10;
		this.Test2V10.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V11.FormattingEnabled = true;
		this.Test2V11.Location = new System.Drawing.Point(506, 26);
		this.Test2V11.Name = "Test2V11";
		this.Test2V11.Size = new System.Drawing.Size(43, 21);
		this.Test2V11.TabIndex = 11;
		this.Test2V11.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V12.FormattingEnabled = true;
		this.Test2V12.Location = new System.Drawing.Point(556, 26);
		this.Test2V12.Name = "Test2V12";
		this.Test2V12.Size = new System.Drawing.Size(43, 21);
		this.Test2V12.TabIndex = 12;
		this.Test2V12.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Valvole2.Controls.Add(this.Test2V16);
		this.Valvole2.Controls.Add(this.Test2V15);
		this.Valvole2.Controls.Add(this.Test2V14);
		this.Valvole2.Controls.Add(this.Test2V13);
		this.Valvole2.Controls.Add(this.Test2V12);
		this.Valvole2.Controls.Add(this.Test2V1);
		this.Valvole2.Controls.Add(this.Test2V2);
		this.Valvole2.Controls.Add(this.Test2V3);
		this.Valvole2.Controls.Add(this.Test2V4);
		this.Valvole2.Controls.Add(this.Test2V5);
		this.Valvole2.Controls.Add(this.Test2V6);
		this.Valvole2.Controls.Add(this.Test2V7);
		this.Valvole2.Controls.Add(this.Test2V8);
		this.Valvole2.Controls.Add(this.Test2V9);
		this.Valvole2.Controls.Add(this.Test2V10);
		this.Valvole2.Controls.Add(this.Test2V11);
		this.Valvole2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole2.Location = new System.Drawing.Point(4, 151);
		this.Valvole2.Name = "Valvole2";
		this.Valvole2.Size = new System.Drawing.Size(712, 55);
		this.Valvole2.TabIndex = 25;
		this.Valvole2.TabStop = false;
		this.Valvole2.Text = "Valvole Test 2";
		this.Test2V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V16.FormattingEnabled = true;
		this.Test2V16.Location = new System.Drawing.Point(385, 8);
		this.Test2V16.Name = "Test2V16";
		this.Test2V16.Size = new System.Drawing.Size(43, 21);
		this.Test2V16.TabIndex = 16;
		this.Test2V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V15.FormattingEnabled = true;
		this.Test2V15.Location = new System.Drawing.Point(335, 8);
		this.Test2V15.Name = "Test2V15";
		this.Test2V15.Size = new System.Drawing.Size(43, 21);
		this.Test2V15.TabIndex = 15;
		this.Test2V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V14.FormattingEnabled = true;
		this.Test2V14.Location = new System.Drawing.Point(285, 8);
		this.Test2V14.Name = "Test2V14";
		this.Test2V14.Size = new System.Drawing.Size(43, 21);
		this.Test2V14.TabIndex = 14;
		this.Test2V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test2V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2V13.FormattingEnabled = true;
		this.Test2V13.Location = new System.Drawing.Point(606, 26);
		this.Test2V13.Name = "Test2V13";
		this.Test2V13.Size = new System.Drawing.Size(43, 21);
		this.Test2V13.TabIndex = 13;
		this.Valvole3.Controls.Add(this.Test3V16);
		this.Valvole3.Controls.Add(this.Test3V13);
		this.Valvole3.Controls.Add(this.Test3V15);
		this.Valvole3.Controls.Add(this.Test3V12);
		this.Valvole3.Controls.Add(this.Test3V14);
		this.Valvole3.Controls.Add(this.Test3V1);
		this.Valvole3.Controls.Add(this.Test3V2);
		this.Valvole3.Controls.Add(this.Test3V3);
		this.Valvole3.Controls.Add(this.Test3V4);
		this.Valvole3.Controls.Add(this.Test3V5);
		this.Valvole3.Controls.Add(this.Test3V6);
		this.Valvole3.Controls.Add(this.Test3V7);
		this.Valvole3.Controls.Add(this.Test3V8);
		this.Valvole3.Controls.Add(this.Test3V9);
		this.Valvole3.Controls.Add(this.Test3V10);
		this.Valvole3.Controls.Add(this.Test3V11);
		this.Valvole3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole3.Location = new System.Drawing.Point(4, 206);
		this.Valvole3.Name = "Valvole3";
		this.Valvole3.Size = new System.Drawing.Size(712, 55);
		this.Valvole3.TabIndex = 26;
		this.Valvole3.TabStop = false;
		this.Valvole3.Text = "Valvole Test 3";
		this.Test3V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V16.FormattingEnabled = true;
		this.Test3V16.Location = new System.Drawing.Point(385, 14);
		this.Test3V16.Name = "Test3V16";
		this.Test3V16.Size = new System.Drawing.Size(43, 21);
		this.Test3V16.TabIndex = 77;
		this.Test3V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V13.FormattingEnabled = true;
		this.Test3V13.Location = new System.Drawing.Point(606, 26);
		this.Test3V13.Name = "Test3V13";
		this.Test3V13.Size = new System.Drawing.Size(43, 21);
		this.Test3V13.TabIndex = 14;
		this.Test3V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V15.FormattingEnabled = true;
		this.Test3V15.Location = new System.Drawing.Point(335, 14);
		this.Test3V15.Name = "Test3V15";
		this.Test3V15.Size = new System.Drawing.Size(43, 21);
		this.Test3V15.TabIndex = 76;
		this.Test3V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V12.FormattingEnabled = true;
		this.Test3V12.Location = new System.Drawing.Point(556, 26);
		this.Test3V12.Name = "Test3V12";
		this.Test3V12.Size = new System.Drawing.Size(43, 21);
		this.Test3V12.TabIndex = 12;
		this.Test3V12.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V14.FormattingEnabled = true;
		this.Test3V14.Location = new System.Drawing.Point(285, 14);
		this.Test3V14.Name = "Test3V14";
		this.Test3V14.Size = new System.Drawing.Size(43, 21);
		this.Test3V14.TabIndex = 75;
		this.Test3V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V1.FormattingEnabled = true;
		this.Test3V1.Location = new System.Drawing.Point(6, 26);
		this.Test3V1.Name = "Test3V1";
		this.Test3V1.Size = new System.Drawing.Size(43, 21);
		this.Test3V1.TabIndex = 1;
		this.Test3V1.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V2.FormattingEnabled = true;
		this.Test3V2.Location = new System.Drawing.Point(56, 26);
		this.Test3V2.Name = "Test3V2";
		this.Test3V2.Size = new System.Drawing.Size(43, 21);
		this.Test3V2.TabIndex = 2;
		this.Test3V2.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V3.FormattingEnabled = true;
		this.Test3V3.Location = new System.Drawing.Point(106, 26);
		this.Test3V3.Name = "Test3V3";
		this.Test3V3.Size = new System.Drawing.Size(43, 21);
		this.Test3V3.TabIndex = 3;
		this.Test3V3.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V4.FormattingEnabled = true;
		this.Test3V4.Location = new System.Drawing.Point(156, 26);
		this.Test3V4.Name = "Test3V4";
		this.Test3V4.Size = new System.Drawing.Size(43, 21);
		this.Test3V4.TabIndex = 4;
		this.Test3V4.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V5.FormattingEnabled = true;
		this.Test3V5.Location = new System.Drawing.Point(206, 26);
		this.Test3V5.Name = "Test3V5";
		this.Test3V5.Size = new System.Drawing.Size(43, 21);
		this.Test3V5.TabIndex = 5;
		this.Test3V5.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V6.FormattingEnabled = true;
		this.Test3V6.Location = new System.Drawing.Point(256, 26);
		this.Test3V6.Name = "Test3V6";
		this.Test3V6.Size = new System.Drawing.Size(43, 21);
		this.Test3V6.TabIndex = 6;
		this.Test3V6.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V7.FormattingEnabled = true;
		this.Test3V7.Location = new System.Drawing.Point(306, 26);
		this.Test3V7.Name = "Test3V7";
		this.Test3V7.Size = new System.Drawing.Size(43, 21);
		this.Test3V7.TabIndex = 7;
		this.Test3V7.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V8.FormattingEnabled = true;
		this.Test3V8.Location = new System.Drawing.Point(356, 26);
		this.Test3V8.Name = "Test3V8";
		this.Test3V8.Size = new System.Drawing.Size(43, 21);
		this.Test3V8.TabIndex = 8;
		this.Test3V8.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V9.FormattingEnabled = true;
		this.Test3V9.Location = new System.Drawing.Point(406, 26);
		this.Test3V9.Name = "Test3V9";
		this.Test3V9.Size = new System.Drawing.Size(43, 21);
		this.Test3V9.TabIndex = 9;
		this.Test3V9.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V10.FormattingEnabled = true;
		this.Test3V10.Location = new System.Drawing.Point(456, 26);
		this.Test3V10.Name = "Test3V10";
		this.Test3V10.Size = new System.Drawing.Size(43, 21);
		this.Test3V10.TabIndex = 10;
		this.Test3V10.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test3V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test3V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3V11.FormattingEnabled = true;
		this.Test3V11.Location = new System.Drawing.Point(506, 26);
		this.Test3V11.Name = "Test3V11";
		this.Test3V11.Size = new System.Drawing.Size(43, 21);
		this.Test3V11.TabIndex = 11;
		this.Test3V11.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.StopTest3.AutoSize = true;
		this.StopTest3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest3.Location = new System.Drawing.Point(6, 190);
		this.StopTest3.Name = "StopTest3";
		this.StopTest3.Size = new System.Drawing.Size(106, 24);
		this.StopTest3.TabIndex = 47;
		this.StopTest3.Text = "Stop Test";
		this.StopTest3.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Valvole4.Controls.Add(this.Test4V16);
		this.Valvole4.Controls.Add(this.Test4V15);
		this.Valvole4.Controls.Add(this.Test4V14);
		this.Valvole4.Controls.Add(this.Test4V13);
		this.Valvole4.Controls.Add(this.Test4V12);
		this.Valvole4.Controls.Add(this.Test4V1);
		this.Valvole4.Controls.Add(this.Test4V2);
		this.Valvole4.Controls.Add(this.Test4V3);
		this.Valvole4.Controls.Add(this.Test4V4);
		this.Valvole4.Controls.Add(this.Test4V5);
		this.Valvole4.Controls.Add(this.Test4V6);
		this.Valvole4.Controls.Add(this.Test4V7);
		this.Valvole4.Controls.Add(this.Test4V8);
		this.Valvole4.Controls.Add(this.Test4V9);
		this.Valvole4.Controls.Add(this.Test4V10);
		this.Valvole4.Controls.Add(this.Test4V11);
		this.Valvole4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole4.Location = new System.Drawing.Point(4, 261);
		this.Valvole4.Name = "Valvole4";
		this.Valvole4.Size = new System.Drawing.Size(712, 55);
		this.Valvole4.TabIndex = 27;
		this.Valvole4.TabStop = false;
		this.Valvole4.Text = "Valvole Test 4";
		this.Test4V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V16.FormattingEnabled = true;
		this.Test4V16.Location = new System.Drawing.Point(385, 10);
		this.Test4V16.Name = "Test4V16";
		this.Test4V16.Size = new System.Drawing.Size(43, 21);
		this.Test4V16.TabIndex = 19;
		this.Test4V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V15.FormattingEnabled = true;
		this.Test4V15.Location = new System.Drawing.Point(335, 10);
		this.Test4V15.Name = "Test4V15";
		this.Test4V15.Size = new System.Drawing.Size(43, 21);
		this.Test4V15.TabIndex = 18;
		this.Test4V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V14.FormattingEnabled = true;
		this.Test4V14.Location = new System.Drawing.Point(285, 10);
		this.Test4V14.Name = "Test4V14";
		this.Test4V14.Size = new System.Drawing.Size(43, 21);
		this.Test4V14.TabIndex = 17;
		this.Test4V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V13.FormattingEnabled = true;
		this.Test4V13.Location = new System.Drawing.Point(606, 26);
		this.Test4V13.Name = "Test4V13";
		this.Test4V13.Size = new System.Drawing.Size(43, 21);
		this.Test4V13.TabIndex = 14;
		this.Test4V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V12.FormattingEnabled = true;
		this.Test4V12.Location = new System.Drawing.Point(556, 26);
		this.Test4V12.Name = "Test4V12";
		this.Test4V12.Size = new System.Drawing.Size(43, 21);
		this.Test4V12.TabIndex = 12;
		this.Test4V12.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V1.FormattingEnabled = true;
		this.Test4V1.Location = new System.Drawing.Point(6, 26);
		this.Test4V1.Name = "Test4V1";
		this.Test4V1.Size = new System.Drawing.Size(43, 21);
		this.Test4V1.TabIndex = 1;
		this.Test4V1.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V2.FormattingEnabled = true;
		this.Test4V2.Location = new System.Drawing.Point(56, 26);
		this.Test4V2.Name = "Test4V2";
		this.Test4V2.Size = new System.Drawing.Size(43, 21);
		this.Test4V2.TabIndex = 2;
		this.Test4V2.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V3.FormattingEnabled = true;
		this.Test4V3.Location = new System.Drawing.Point(106, 26);
		this.Test4V3.Name = "Test4V3";
		this.Test4V3.Size = new System.Drawing.Size(43, 21);
		this.Test4V3.TabIndex = 3;
		this.Test4V3.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V4.FormattingEnabled = true;
		this.Test4V4.Location = new System.Drawing.Point(156, 26);
		this.Test4V4.Name = "Test4V4";
		this.Test4V4.Size = new System.Drawing.Size(43, 21);
		this.Test4V4.TabIndex = 4;
		this.Test4V4.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V5.FormattingEnabled = true;
		this.Test4V5.Location = new System.Drawing.Point(206, 26);
		this.Test4V5.Name = "Test4V5";
		this.Test4V5.Size = new System.Drawing.Size(43, 21);
		this.Test4V5.TabIndex = 5;
		this.Test4V5.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V6.FormattingEnabled = true;
		this.Test4V6.Location = new System.Drawing.Point(256, 26);
		this.Test4V6.Name = "Test4V6";
		this.Test4V6.Size = new System.Drawing.Size(43, 21);
		this.Test4V6.TabIndex = 6;
		this.Test4V6.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V7.FormattingEnabled = true;
		this.Test4V7.Location = new System.Drawing.Point(306, 26);
		this.Test4V7.Name = "Test4V7";
		this.Test4V7.Size = new System.Drawing.Size(43, 21);
		this.Test4V7.TabIndex = 7;
		this.Test4V7.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V8.FormattingEnabled = true;
		this.Test4V8.Location = new System.Drawing.Point(356, 26);
		this.Test4V8.Name = "Test4V8";
		this.Test4V8.Size = new System.Drawing.Size(43, 21);
		this.Test4V8.TabIndex = 8;
		this.Test4V8.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V9.FormattingEnabled = true;
		this.Test4V9.Location = new System.Drawing.Point(406, 26);
		this.Test4V9.Name = "Test4V9";
		this.Test4V9.Size = new System.Drawing.Size(43, 21);
		this.Test4V9.TabIndex = 9;
		this.Test4V9.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V10.FormattingEnabled = true;
		this.Test4V10.Location = new System.Drawing.Point(456, 26);
		this.Test4V10.Name = "Test4V10";
		this.Test4V10.Size = new System.Drawing.Size(43, 21);
		this.Test4V10.TabIndex = 10;
		this.Test4V10.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test4V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test4V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4V11.FormattingEnabled = true;
		this.Test4V11.Location = new System.Drawing.Point(506, 26);
		this.Test4V11.Name = "Test4V11";
		this.Test4V11.Size = new System.Drawing.Size(43, 21);
		this.Test4V11.TabIndex = 11;
		this.Test4V11.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.StopTest4.AutoSize = true;
		this.StopTest4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest4.Location = new System.Drawing.Point(6, 190);
		this.StopTest4.Name = "StopTest4";
		this.StopTest4.Size = new System.Drawing.Size(106, 24);
		this.StopTest4.TabIndex = 48;
		this.StopTest4.Text = "Stop Test";
		this.StopTest4.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Valvole5.Controls.Add(this.Test5V16);
		this.Valvole5.Controls.Add(this.Test5V15);
		this.Valvole5.Controls.Add(this.Test5V14);
		this.Valvole5.Controls.Add(this.Test5V13);
		this.Valvole5.Controls.Add(this.Test5V12);
		this.Valvole5.Controls.Add(this.Test5V1);
		this.Valvole5.Controls.Add(this.Test5V2);
		this.Valvole5.Controls.Add(this.Test5V3);
		this.Valvole5.Controls.Add(this.Test5V4);
		this.Valvole5.Controls.Add(this.Test5V5);
		this.Valvole5.Controls.Add(this.Test5V6);
		this.Valvole5.Controls.Add(this.Test5V7);
		this.Valvole5.Controls.Add(this.Test5V8);
		this.Valvole5.Controls.Add(this.Test5V9);
		this.Valvole5.Controls.Add(this.Test5V10);
		this.Valvole5.Controls.Add(this.Test5V11);
		this.Valvole5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole5.Location = new System.Drawing.Point(4, 316);
		this.Valvole5.Name = "Valvole5";
		this.Valvole5.Size = new System.Drawing.Size(712, 55);
		this.Valvole5.TabIndex = 28;
		this.Valvole5.TabStop = false;
		this.Valvole5.Text = "Valvole Test 5";
		this.Test5V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V16.FormattingEnabled = true;
		this.Test5V16.Location = new System.Drawing.Point(385, 11);
		this.Test5V16.Name = "Test5V16";
		this.Test5V16.Size = new System.Drawing.Size(43, 21);
		this.Test5V16.TabIndex = 19;
		this.Test5V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V15.FormattingEnabled = true;
		this.Test5V15.Location = new System.Drawing.Point(335, 11);
		this.Test5V15.Name = "Test5V15";
		this.Test5V15.Size = new System.Drawing.Size(43, 21);
		this.Test5V15.TabIndex = 18;
		this.Test5V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V14.FormattingEnabled = true;
		this.Test5V14.Location = new System.Drawing.Point(285, 11);
		this.Test5V14.Name = "Test5V14";
		this.Test5V14.Size = new System.Drawing.Size(43, 21);
		this.Test5V14.TabIndex = 17;
		this.Test5V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V13.FormattingEnabled = true;
		this.Test5V13.Location = new System.Drawing.Point(606, 26);
		this.Test5V13.Name = "Test5V13";
		this.Test5V13.Size = new System.Drawing.Size(43, 21);
		this.Test5V13.TabIndex = 14;
		this.Test5V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V12.FormattingEnabled = true;
		this.Test5V12.Location = new System.Drawing.Point(556, 26);
		this.Test5V12.Name = "Test5V12";
		this.Test5V12.Size = new System.Drawing.Size(43, 21);
		this.Test5V12.TabIndex = 12;
		this.Test5V12.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V1.FormattingEnabled = true;
		this.Test5V1.Location = new System.Drawing.Point(6, 26);
		this.Test5V1.Name = "Test5V1";
		this.Test5V1.Size = new System.Drawing.Size(43, 21);
		this.Test5V1.TabIndex = 1;
		this.Test5V1.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V2.FormattingEnabled = true;
		this.Test5V2.Location = new System.Drawing.Point(56, 26);
		this.Test5V2.Name = "Test5V2";
		this.Test5V2.Size = new System.Drawing.Size(43, 21);
		this.Test5V2.TabIndex = 2;
		this.Test5V2.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V3.FormattingEnabled = true;
		this.Test5V3.Location = new System.Drawing.Point(106, 26);
		this.Test5V3.Name = "Test5V3";
		this.Test5V3.Size = new System.Drawing.Size(43, 21);
		this.Test5V3.TabIndex = 3;
		this.Test5V3.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V4.FormattingEnabled = true;
		this.Test5V4.Location = new System.Drawing.Point(156, 26);
		this.Test5V4.Name = "Test5V4";
		this.Test5V4.Size = new System.Drawing.Size(43, 21);
		this.Test5V4.TabIndex = 4;
		this.Test5V4.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V5.FormattingEnabled = true;
		this.Test5V5.Location = new System.Drawing.Point(206, 26);
		this.Test5V5.Name = "Test5V5";
		this.Test5V5.Size = new System.Drawing.Size(43, 21);
		this.Test5V5.TabIndex = 5;
		this.Test5V5.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V6.FormattingEnabled = true;
		this.Test5V6.Location = new System.Drawing.Point(256, 26);
		this.Test5V6.Name = "Test5V6";
		this.Test5V6.Size = new System.Drawing.Size(43, 21);
		this.Test5V6.TabIndex = 6;
		this.Test5V6.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V7.FormattingEnabled = true;
		this.Test5V7.Location = new System.Drawing.Point(306, 26);
		this.Test5V7.Name = "Test5V7";
		this.Test5V7.Size = new System.Drawing.Size(43, 21);
		this.Test5V7.TabIndex = 7;
		this.Test5V7.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V8.FormattingEnabled = true;
		this.Test5V8.Location = new System.Drawing.Point(356, 26);
		this.Test5V8.Name = "Test5V8";
		this.Test5V8.Size = new System.Drawing.Size(43, 21);
		this.Test5V8.TabIndex = 8;
		this.Test5V8.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V9.FormattingEnabled = true;
		this.Test5V9.Location = new System.Drawing.Point(406, 26);
		this.Test5V9.Name = "Test5V9";
		this.Test5V9.Size = new System.Drawing.Size(43, 21);
		this.Test5V9.TabIndex = 9;
		this.Test5V9.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V10.FormattingEnabled = true;
		this.Test5V10.Location = new System.Drawing.Point(456, 26);
		this.Test5V10.Name = "Test5V10";
		this.Test5V10.Size = new System.Drawing.Size(43, 21);
		this.Test5V10.TabIndex = 10;
		this.Test5V10.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test5V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test5V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5V11.FormattingEnabled = true;
		this.Test5V11.Location = new System.Drawing.Point(506, 26);
		this.Test5V11.Name = "Test5V11";
		this.Test5V11.Size = new System.Drawing.Size(43, 21);
		this.Test5V11.TabIndex = 11;
		this.Test5V11.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.StopTest5.AutoSize = true;
		this.StopTest5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest5.Location = new System.Drawing.Point(6, 190);
		this.StopTest5.Name = "StopTest5";
		this.StopTest5.Size = new System.Drawing.Size(106, 24);
		this.StopTest5.TabIndex = 48;
		this.StopTest5.Text = "Stop Test";
		this.StopTest5.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.List.AllowUserToOrderColumns = true;
		this.List.AllowUserToResizeColumns = false;
		this.List.AllowUserToResizeRows = false;
		this.List.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		dataGridViewCellStyle.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		dataGridViewCellStyle.BackColor = System.Drawing.SystemColors.Control;
		dataGridViewCellStyle.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle.ForeColor = System.Drawing.SystemColors.WindowText;
		dataGridViewCellStyle.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
		this.List.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle;
		this.List.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
		this.List.Columns.AddRange(this.ID, this.CP, this.Pompa, this.Motore, this.Pressione, this.Impulso, this.Impulsi, this.V1, this.V2, this.V3, this.V4, this.V5, this.V6, this.V7, this.V8, this.V9, this.V10, this.V11, this.V12, this.V13, this.V14, this.V15, this.V16);
		dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
		dataGridViewCellStyle2.BackColor = System.Drawing.SystemColors.Window;
		dataGridViewCellStyle2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle2.ForeColor = System.Drawing.SystemColors.ControlText;
		dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.False;
		this.List.DefaultCellStyle = dataGridViewCellStyle2;
		this.List.Location = new System.Drawing.Point(727, 37);
		this.List.Name = "List";
		this.List.Size = new System.Drawing.Size(1170, 497);
		this.List.TabIndex = 29;
		this.List.CellClick += new System.Windows.Forms.DataGridViewCellEventHandler(List_CellClick);
		this.List.DataError += new System.Windows.Forms.DataGridViewDataErrorEventHandler(List_DataError);
		this.List.RowHeaderMouseClick += new System.Windows.Forms.DataGridViewCellMouseEventHandler(List_RowHeaderMouseClick);
		this.List.RowsAdded += new System.Windows.Forms.DataGridViewRowsAddedEventHandler(List_RowsAdded);
		this.List.KeyUp += new System.Windows.Forms.KeyEventHandler(List_KeyUp);
		this.List.Leave += new System.EventHandler(List_Leave);
		this.ID.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.ID.DataPropertyName = "ID";
		this.ID.HeaderText = "N°";
		this.ID.Name = "ID";
		this.ID.ReadOnly = true;
		this.ID.Width = 52;
		this.CP.HeaderText = "Controllo Bassa Perssione";
		this.CP.Name = "CP";
		this.CP.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.CP.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.CP.Width = 70;
		this.Pompa.DataPropertyName = "Pompa";
		this.Pompa.HeaderText = "Pompa";
		this.Pompa.Name = "Pompa";
		this.Pompa.Width = 70;
		this.Motore.DataPropertyName = "Motore";
		this.Motore.HeaderText = "Motore";
		this.Motore.Name = "Motore";
		this.Motore.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.Motore.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
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
		this.V2.Width = 44;
		this.V3.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V3.HeaderText = "3";
		this.V3.Name = "V3";
		this.V3.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V3.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V3.Width = 44;
		this.V4.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V4.HeaderText = "4";
		this.V4.Name = "V4";
		this.V4.Width = 39;
		this.V5.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V5.HeaderText = "5";
		this.V5.Name = "V5";
		this.V5.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V5.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V5.Width = 44;
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
		this.V14.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.V14.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.Automatic;
		this.V14.Width = 54;
		this.V15.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V15.HeaderText = "15";
		this.V15.Name = "V15";
		this.V15.Width = 39;
		this.V16.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.V16.HeaderText = "16";
		this.V16.Name = "V16";
		this.V16.Width = 39;
		this.label1.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(1484, 778);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(130, 20);
		this.label1.TabIndex = 30;
		this.label1.Text = "Pressione Max:";
		this.label2.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(1255, 778);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(111, 20);
		this.label2.TabIndex = 32;
		this.label2.Text = "Allarme Sup:";
		this.AllarmeSup.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.AllarmeSup.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.AllarmeSup.Location = new System.Drawing.Point(1372, 778);
		this.AllarmeSup.Name = "AllarmeSup";
		this.AllarmeSup.Size = new System.Drawing.Size(45, 22);
		this.AllarmeSup.TabIndex = 9;
		this.AllarmeSup.Text = "3";
		this.AllarmeSup.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.AllarmeSup.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.AllarmeSup.Validating += new System.ComponentModel.CancelEventHandler(Validating_Float);
		this.label3.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(1723, 872);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(123, 20);
		this.label3.TabIndex = 36;
		this.label3.Text = "Impulso test5:";
		this.Pulse5.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Pulse5.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pulse5.Location = new System.Drawing.Point(1852, 874);
		this.Pulse5.Name = "Pulse5";
		this.Pulse5.Size = new System.Drawing.Size(45, 22);
		this.Pulse5.TabIndex = 11;
		this.Pulse5.Text = "750";
		this.Pulse5.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.Pulse5.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.Pulse5.Validating += new System.ComponentModel.CancelEventHandler(Validating_Short);
		this.label4.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(1723, 778);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(123, 20);
		this.label4.TabIndex = 34;
		this.label4.Text = "Impulso test4:";
		this.Pulse4.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Pulse4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pulse4.Location = new System.Drawing.Point(1852, 780);
		this.Pulse4.Name = "Pulse4";
		this.Pulse4.Size = new System.Drawing.Size(45, 22);
		this.Pulse4.TabIndex = 10;
		this.Pulse4.Text = "750";
		this.Pulse4.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.Pulse4.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.Pulse4.Validating += new System.ComponentModel.CancelEventHandler(Validating_Short);
		this.Cmp41.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp41.Location = new System.Drawing.Point(114, 50);
		this.Cmp41.Name = "Cmp41";
		this.Cmp41.Size = new System.Drawing.Size(34, 30);
		this.Cmp41.TabIndex = 37;
		this.Cmp41.Text = ">";
		this.Cmp41.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Test4.Controls.Add(this.label28);
		this.Test4.Controls.Add(this.Pos4);
		this.Test4.Controls.Add(this.Testo4);
		this.Test4.Controls.Add(this.StopTest4);
		this.Test4.Controls.Add(this.ControlloPressioni4);
		this.Test4.Controls.Add(this.Val44);
		this.Test4.Controls.Add(this.Val43);
		this.Test4.Controls.Add(this.Val42);
		this.Test4.Controls.Add(this.Canale44);
		this.Test4.Controls.Add(this.Canale43);
		this.Test4.Controls.Add(this.Canale42);
		this.Test4.Controls.Add(this.Val41);
		this.Test4.Controls.Add(this.Canale41);
		this.Test4.Controls.Add(this.Cmp44);
		this.Test4.Controls.Add(this.Cmp43);
		this.Test4.Controls.Add(this.Cmp42);
		this.Test4.Controls.Add(this.Cmp41);
		this.Test4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test4.Location = new System.Drawing.Point(272, 798);
		this.Test4.Name = "Test4";
		this.Test4.Size = new System.Drawing.Size(254, 245);
		this.Test4.TabIndex = 0;
		this.Test4.TabStop = false;
		this.Test4.Text = "Test 4";
		this.label28.AutoSize = true;
		this.label28.Location = new System.Drawing.Point(156, 194);
		this.label28.Name = "label28";
		this.label28.Size = new System.Drawing.Size(44, 20);
		this.label28.TabIndex = 71;
		this.label28.Text = "Pos:";
		this.Pos4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos4.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos4.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos4.Location = new System.Drawing.Point(208, 191);
		this.Pos4.Name = "Pos4";
		this.Pos4.Size = new System.Drawing.Size(38, 24);
		this.Pos4.TabIndex = 70;
		this.Pos4.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo4.Location = new System.Drawing.Point(6, 22);
		this.Testo4.Name = "Testo4";
		this.Testo4.Size = new System.Drawing.Size(240, 26);
		this.Testo4.TabIndex = 69;
		this.Testo4.Text = "Pedal retention test + ESP";
		this.ControlloPressioni4.AutoSize = true;
		this.ControlloPressioni4.Checked = true;
		this.ControlloPressioni4.CheckState = System.Windows.Forms.CheckState.Checked;
		this.ControlloPressioni4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ControlloPressioni4.Location = new System.Drawing.Point(6, 221);
		this.ControlloPressioni4.Name = "ControlloPressioni4";
		this.ControlloPressioni4.Size = new System.Drawing.Size(178, 24);
		this.ControlloPressioni4.TabIndex = 46;
		this.ControlloPressioni4.Text = "Controllo Pressioni";
		this.ControlloPressioni4.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val44.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val44.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val44.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val44.Location = new System.Drawing.Point(154, 158);
		this.Val44.Name = "Val44";
		this.Val44.Size = new System.Drawing.Size(92, 24);
		this.Val44.TabIndex = 3;
		this.Val44.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val43.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val43.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val43.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val43.Location = new System.Drawing.Point(154, 123);
		this.Val43.Name = "Val43";
		this.Val43.Size = new System.Drawing.Size(92, 24);
		this.Val43.TabIndex = 2;
		this.Val43.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val42.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val42.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val42.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val42.Location = new System.Drawing.Point(154, 86);
		this.Val42.Name = "Val42";
		this.Val42.Size = new System.Drawing.Size(92, 24);
		this.Val42.TabIndex = 1;
		this.Val42.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale44.AutoSize = true;
		this.Canale44.Checked = true;
		this.Canale44.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale44.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale44.Location = new System.Drawing.Point(6, 158);
		this.Canale44.Name = "Canale44";
		this.Canale44.Size = new System.Drawing.Size(104, 24);
		this.Canale44.TabIndex = 45;
		this.Canale44.Text = "Canale 4:";
		this.Canale44.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale43.AutoSize = true;
		this.Canale43.Checked = true;
		this.Canale43.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale43.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale43.Location = new System.Drawing.Point(6, 122);
		this.Canale43.Name = "Canale43";
		this.Canale43.Size = new System.Drawing.Size(104, 24);
		this.Canale43.TabIndex = 44;
		this.Canale43.Text = "Canale 3:";
		this.Canale43.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale42.AutoSize = true;
		this.Canale42.Checked = true;
		this.Canale42.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale42.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale42.Location = new System.Drawing.Point(6, 86);
		this.Canale42.Name = "Canale42";
		this.Canale42.Size = new System.Drawing.Size(104, 24);
		this.Canale42.TabIndex = 43;
		this.Canale42.Text = "Canale 2:";
		this.Canale42.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val41.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val41.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val41.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val41.Location = new System.Drawing.Point(154, 50);
		this.Val41.Name = "Val41";
		this.Val41.Size = new System.Drawing.Size(92, 24);
		this.Val41.TabIndex = 0;
		this.Val41.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale41.AutoSize = true;
		this.Canale41.Checked = true;
		this.Canale41.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale41.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale41.Location = new System.Drawing.Point(6, 50);
		this.Canale41.Name = "Canale41";
		this.Canale41.Size = new System.Drawing.Size(104, 24);
		this.Canale41.TabIndex = 41;
		this.Canale41.Text = "Canale 1:";
		this.Canale41.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Cmp44.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp44.Location = new System.Drawing.Point(114, 158);
		this.Cmp44.Name = "Cmp44";
		this.Cmp44.Size = new System.Drawing.Size(34, 30);
		this.Cmp44.TabIndex = 40;
		this.Cmp44.Text = ">";
		this.Cmp44.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp43.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp43.Location = new System.Drawing.Point(114, 122);
		this.Cmp43.Name = "Cmp43";
		this.Cmp43.Size = new System.Drawing.Size(34, 30);
		this.Cmp43.TabIndex = 39;
		this.Cmp43.Text = ">";
		this.Cmp43.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp42.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp42.Location = new System.Drawing.Point(114, 86);
		this.Cmp42.Name = "Cmp42";
		this.Cmp42.Size = new System.Drawing.Size(34, 30);
		this.Cmp42.TabIndex = 38;
		this.Cmp42.Text = ">";
		this.Cmp42.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Test5.Controls.Add(this.label25);
		this.Test5.Controls.Add(this.Pos5);
		this.Test5.Controls.Add(this.Testo5);
		this.Test5.Controls.Add(this.StopTest5);
		this.Test5.Controls.Add(this.ControlloPressioni5);
		this.Test5.Controls.Add(this.Val54);
		this.Test5.Controls.Add(this.Val53);
		this.Test5.Controls.Add(this.Val52);
		this.Test5.Controls.Add(this.Canale54);
		this.Test5.Controls.Add(this.Canale53);
		this.Test5.Controls.Add(this.Canale52);
		this.Test5.Controls.Add(this.Val51);
		this.Test5.Controls.Add(this.Canale51);
		this.Test5.Controls.Add(this.Cmp54);
		this.Test5.Controls.Add(this.Cmp53);
		this.Test5.Controls.Add(this.Cmp52);
		this.Test5.Controls.Add(this.Cmp51);
		this.Test5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test5.Location = new System.Drawing.Point(532, 547);
		this.Test5.Name = "Test5";
		this.Test5.Size = new System.Drawing.Size(254, 245);
		this.Test5.TabIndex = 1;
		this.Test5.TabStop = false;
		this.Test5.Text = "Test 5";
		this.label25.AutoSize = true;
		this.label25.Location = new System.Drawing.Point(156, 194);
		this.label25.Name = "label25";
		this.label25.Size = new System.Drawing.Size(44, 20);
		this.label25.TabIndex = 64;
		this.label25.Text = "Pos:";
		this.Pos5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos5.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos5.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos5.Location = new System.Drawing.Point(206, 191);
		this.Pos5.Name = "Pos5";
		this.Pos5.Size = new System.Drawing.Size(38, 24);
		this.Pos5.TabIndex = 63;
		this.Pos5.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo5.Location = new System.Drawing.Point(6, 22);
		this.Testo5.Name = "Testo5";
		this.Testo5.Size = new System.Drawing.Size(240, 26);
		this.Testo5.TabIndex = 62;
		this.Testo5.Text = "Pedal retention test + ESP";
		this.ControlloPressioni5.AutoSize = true;
		this.ControlloPressioni5.Checked = true;
		this.ControlloPressioni5.CheckState = System.Windows.Forms.CheckState.Checked;
		this.ControlloPressioni5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ControlloPressioni5.Location = new System.Drawing.Point(6, 221);
		this.ControlloPressioni5.Name = "ControlloPressioni5";
		this.ControlloPressioni5.Size = new System.Drawing.Size(178, 24);
		this.ControlloPressioni5.TabIndex = 47;
		this.ControlloPressioni5.Text = "Controllo Pressioni";
		this.ControlloPressioni5.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val54.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val54.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val54.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val54.Location = new System.Drawing.Point(152, 158);
		this.Val54.Name = "Val54";
		this.Val54.Size = new System.Drawing.Size(92, 24);
		this.Val54.TabIndex = 7;
		this.Val54.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val53.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val53.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val53.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val53.Location = new System.Drawing.Point(152, 122);
		this.Val53.Name = "Val53";
		this.Val53.Size = new System.Drawing.Size(92, 24);
		this.Val53.TabIndex = 6;
		this.Val53.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val52.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val52.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val52.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val52.Location = new System.Drawing.Point(152, 86);
		this.Val52.Name = "Val52";
		this.Val52.Size = new System.Drawing.Size(92, 24);
		this.Val52.TabIndex = 5;
		this.Val52.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale54.AutoSize = true;
		this.Canale54.Checked = true;
		this.Canale54.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale54.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale54.Location = new System.Drawing.Point(6, 158);
		this.Canale54.Name = "Canale54";
		this.Canale54.Size = new System.Drawing.Size(104, 24);
		this.Canale54.TabIndex = 45;
		this.Canale54.Text = "Canale 4:";
		this.Canale54.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale53.AutoSize = true;
		this.Canale53.Checked = true;
		this.Canale53.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale53.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale53.Location = new System.Drawing.Point(6, 122);
		this.Canale53.Name = "Canale53";
		this.Canale53.Size = new System.Drawing.Size(104, 24);
		this.Canale53.TabIndex = 44;
		this.Canale53.Text = "Canale 3:";
		this.Canale53.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale52.AutoSize = true;
		this.Canale52.Checked = true;
		this.Canale52.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale52.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale52.Location = new System.Drawing.Point(6, 86);
		this.Canale52.Name = "Canale52";
		this.Canale52.Size = new System.Drawing.Size(104, 24);
		this.Canale52.TabIndex = 43;
		this.Canale52.Text = "Canale 2:";
		this.Canale52.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val51.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val51.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val51.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val51.Location = new System.Drawing.Point(152, 50);
		this.Val51.Name = "Val51";
		this.Val51.Size = new System.Drawing.Size(92, 24);
		this.Val51.TabIndex = 4;
		this.Val51.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale51.AutoSize = true;
		this.Canale51.Checked = true;
		this.Canale51.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale51.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale51.Location = new System.Drawing.Point(6, 50);
		this.Canale51.Name = "Canale51";
		this.Canale51.Size = new System.Drawing.Size(104, 24);
		this.Canale51.TabIndex = 41;
		this.Canale51.Text = "Canale 1:";
		this.Canale51.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Cmp54.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp54.Location = new System.Drawing.Point(114, 158);
		this.Cmp54.Name = "Cmp54";
		this.Cmp54.Size = new System.Drawing.Size(34, 30);
		this.Cmp54.TabIndex = 40;
		this.Cmp54.Text = ">";
		this.Cmp54.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp53.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp53.Location = new System.Drawing.Point(114, 122);
		this.Cmp53.Name = "Cmp53";
		this.Cmp53.Size = new System.Drawing.Size(34, 30);
		this.Cmp53.TabIndex = 39;
		this.Cmp53.Text = ">";
		this.Cmp53.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp52.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp52.Location = new System.Drawing.Point(114, 86);
		this.Cmp52.Name = "Cmp52";
		this.Cmp52.Size = new System.Drawing.Size(34, 30);
		this.Cmp52.TabIndex = 38;
		this.Cmp52.Text = ">";
		this.Cmp52.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp51.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp51.Location = new System.Drawing.Point(114, 50);
		this.Cmp51.Name = "Cmp51";
		this.Cmp51.Size = new System.Drawing.Size(34, 30);
		this.Cmp51.TabIndex = 37;
		this.Cmp51.Text = ">";
		this.Cmp51.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Salva.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Salva.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Salva.Location = new System.Drawing.Point(1058, 1008);
		this.Salva.Name = "Salva";
		this.Salva.Size = new System.Drawing.Size(95, 35);
		this.Salva.TabIndex = 37;
		this.Salva.Text = "Salva";
		this.Salva.UseVisualStyleBackColor = true;
		this.Salva.Click += new System.EventHandler(Salva_Click);
		this.Chiudi.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Chiudi.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Chiudi.Location = new System.Drawing.Point(1802, 1008);
		this.Chiudi.Name = "Chiudi";
		this.Chiudi.Size = new System.Drawing.Size(95, 35);
		this.Chiudi.TabIndex = 39;
		this.Chiudi.Text = "Chiudi";
		this.Chiudi.UseVisualStyleBackColor = true;
		this.Chiudi.Click += new System.EventHandler(Annulla_Click);
		this.Invia.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Invia.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Invia.Location = new System.Drawing.Point(1685, 1008);
		this.Invia.Name = "Invia";
		this.Invia.Size = new System.Drawing.Size(95, 35);
		this.Invia.TabIndex = 40;
		this.Invia.Text = "Invia";
		this.Invia.UseVisualStyleBackColor = true;
		this.Invia.EnabledChanged += new System.EventHandler(Invia_EnabledChanged);
		this.Invia.Click += new System.EventHandler(Invia_Click);
		this.label5.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label5.AutoSize = true;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.Location = new System.Drawing.Point(723, 9);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(60, 20);
		this.label5.TabIndex = 42;
		this.label5.Text = "Nome:";
		this.Nome.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Nome.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Nome.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Nome.Location = new System.Drawing.Point(789, 9);
		this.Nome.Name = "Nome";
		this.Nome.Size = new System.Drawing.Size(241, 24);
		this.Nome.TabIndex = 41;
		this.Nome.SelectedIndexChanged += new System.EventHandler(Nome_SelectedIndexChanged);
		this.label6.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(1484, 872);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(126, 20);
		this.label6.TabIndex = 44;
		this.label6.Text = "Pressione Min:";
		this.PressioneMin.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneMin.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneMin.Location = new System.Drawing.Point(1616, 872);
		this.PressioneMin.Name = "PressioneMin";
		this.PressioneMin.Size = new System.Drawing.Size(45, 22);
		this.PressioneMin.TabIndex = 43;
		this.PressioneMin.Text = "10";
		this.PressioneMin.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.PressioneMin.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.PressioneMin.Validating += new System.ComponentModel.CancelEventHandler(Validating_Short);
		this.Test3.Controls.Add(this.label24);
		this.Test3.Controls.Add(this.Pos3);
		this.Test3.Controls.Add(this.Testo3);
		this.Test3.Controls.Add(this.StopTest3);
		this.Test3.Controls.Add(this.TypeTest3);
		this.Test3.Controls.Add(this.label15);
		this.Test3.Controls.Add(this.Val34);
		this.Test3.Controls.Add(this.Val33);
		this.Test3.Controls.Add(this.Val32);
		this.Test3.Controls.Add(this.Canale34);
		this.Test3.Controls.Add(this.Canale33);
		this.Test3.Controls.Add(this.Canale32);
		this.Test3.Controls.Add(this.Val31);
		this.Test3.Controls.Add(this.Canale31);
		this.Test3.Controls.Add(this.label7);
		this.Test3.Controls.Add(this.label8);
		this.Test3.Controls.Add(this.label9);
		this.Test3.Controls.Add(this.label10);
		this.Test3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test3.Location = new System.Drawing.Point(272, 547);
		this.Test3.Name = "Test3";
		this.Test3.Size = new System.Drawing.Size(254, 245);
		this.Test3.TabIndex = 45;
		this.Test3.TabStop = false;
		this.Test3.Text = "Test 3";
		this.label24.AutoSize = true;
		this.label24.Location = new System.Drawing.Point(156, 194);
		this.label24.Name = "label24";
		this.label24.Size = new System.Drawing.Size(44, 20);
		this.label24.TabIndex = 63;
		this.label24.Text = "Pos:";
		this.Pos3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos3.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos3.Location = new System.Drawing.Point(208, 192);
		this.Pos3.Name = "Pos3";
		this.Pos3.Size = new System.Drawing.Size(38, 24);
		this.Pos3.TabIndex = 62;
		this.Pos3.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo3.Location = new System.Drawing.Point(6, 22);
		this.Testo3.Name = "Testo3";
		this.Testo3.Size = new System.Drawing.Size(240, 26);
		this.Testo3.TabIndex = 61;
		this.Testo3.Text = "Anti-lock test";
		this.TypeTest3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TypeTest3.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.TypeTest3.Items.AddRange(new object[2] { "DEFAUL", "ATEMk100" });
		this.TypeTest3.Location = new System.Drawing.Point(92, 220);
		this.TypeTest3.Name = "TypeTest3";
		this.TypeTest3.Size = new System.Drawing.Size(154, 24);
		this.TypeTest3.TabIndex = 57;
		this.TypeTest3.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.label15.AutoSize = true;
		this.label15.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label15.Location = new System.Drawing.Point(2, 220);
		this.label15.Name = "label15";
		this.label15.Size = new System.Drawing.Size(84, 20);
		this.label15.TabIndex = 56;
		this.label15.Text = "Tipo test:";
		this.Val34.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val34.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val34.Items.AddRange(new object[2] { "P_Min", "- P_Pompa" });
		this.Val34.Location = new System.Drawing.Point(154, 158);
		this.Val34.Name = "Val34";
		this.Val34.Size = new System.Drawing.Size(92, 24);
		this.Val34.TabIndex = 3;
		this.Val34.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val33.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val33.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val33.Items.AddRange(new object[2] { "P_Min", "- P_Pompa" });
		this.Val33.Location = new System.Drawing.Point(154, 123);
		this.Val33.Name = "Val33";
		this.Val33.Size = new System.Drawing.Size(92, 24);
		this.Val33.TabIndex = 2;
		this.Val33.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val32.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val32.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val32.Items.AddRange(new object[2] { "P_Min", "- P_Pompa" });
		this.Val32.Location = new System.Drawing.Point(154, 86);
		this.Val32.Name = "Val32";
		this.Val32.Size = new System.Drawing.Size(92, 24);
		this.Val32.TabIndex = 1;
		this.Val32.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale34.AutoSize = true;
		this.Canale34.Checked = true;
		this.Canale34.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale34.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale34.Location = new System.Drawing.Point(6, 158);
		this.Canale34.Name = "Canale34";
		this.Canale34.Size = new System.Drawing.Size(104, 24);
		this.Canale34.TabIndex = 45;
		this.Canale34.Text = "Canale 4:";
		this.Canale34.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale33.AutoSize = true;
		this.Canale33.Checked = true;
		this.Canale33.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale33.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale33.Location = new System.Drawing.Point(6, 122);
		this.Canale33.Name = "Canale33";
		this.Canale33.Size = new System.Drawing.Size(104, 24);
		this.Canale33.TabIndex = 44;
		this.Canale33.Text = "Canale 3:";
		this.Canale33.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale32.AutoSize = true;
		this.Canale32.Checked = true;
		this.Canale32.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale32.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale32.Location = new System.Drawing.Point(6, 86);
		this.Canale32.Name = "Canale32";
		this.Canale32.Size = new System.Drawing.Size(104, 24);
		this.Canale32.TabIndex = 43;
		this.Canale32.Text = "Canale 2:";
		this.Canale32.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Val31.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val31.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val31.Items.AddRange(new object[2] { "P_Min", "- P_Pompa" });
		this.Val31.Location = new System.Drawing.Point(154, 50);
		this.Val31.Name = "Val31";
		this.Val31.Size = new System.Drawing.Size(92, 24);
		this.Val31.TabIndex = 0;
		this.Val31.SelectedIndexChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale31.AutoSize = true;
		this.Canale31.Checked = true;
		this.Canale31.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale31.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale31.Location = new System.Drawing.Point(6, 50);
		this.Canale31.Name = "Canale31";
		this.Canale31.Size = new System.Drawing.Size(104, 24);
		this.Canale31.TabIndex = 41;
		this.Canale31.Text = "Canale 1:";
		this.Canale31.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.label7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label7.Location = new System.Drawing.Point(114, 158);
		this.label7.Name = "label7";
		this.label7.Size = new System.Drawing.Size(34, 30);
		this.label7.TabIndex = 40;
		this.label7.Text = ">";
		this.label7.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label8.Location = new System.Drawing.Point(114, 122);
		this.label8.Name = "label8";
		this.label8.Size = new System.Drawing.Size(34, 30);
		this.label8.TabIndex = 39;
		this.label8.Text = ">";
		this.label8.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label9.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label9.Location = new System.Drawing.Point(114, 86);
		this.label9.Name = "label9";
		this.label9.Size = new System.Drawing.Size(34, 30);
		this.label9.TabIndex = 38;
		this.label9.Text = ">";
		this.label9.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label10.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label10.Location = new System.Drawing.Point(114, 50);
		this.label10.Name = "label10";
		this.label10.Size = new System.Drawing.Size(34, 30);
		this.label10.TabIndex = 37;
		this.label10.Text = ">";
		this.label10.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label11.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label11.AutoSize = true;
		this.label11.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label11.Location = new System.Drawing.Point(1255, 872);
		this.label11.Name = "label11";
		this.label11.Size = new System.Drawing.Size(101, 20);
		this.label11.TabIndex = 47;
		this.label11.Text = "Allarme Inf:";
		this.AllarmeInf.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.AllarmeInf.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.AllarmeInf.Location = new System.Drawing.Point(1362, 872);
		this.AllarmeInf.Name = "AllarmeInf";
		this.AllarmeInf.Size = new System.Drawing.Size(45, 22);
		this.AllarmeInf.TabIndex = 46;
		this.AllarmeInf.Text = "1";
		this.AllarmeInf.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.AllarmeInf.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.AllarmeInf.Validating += new System.ComponentModel.CancelEventHandler(Validating_Float);
		this.label12.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label12.AutoSize = true;
		this.label12.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label12.Location = new System.Drawing.Point(1054, 872);
		this.label12.Name = "label12";
		this.label12.Size = new System.Drawing.Size(117, 20);
		this.label12.TabIndex = 51;
		this.label12.Text = "Corrente Min:";
		this.CorrenteMin.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.CorrenteMin.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.CorrenteMin.Location = new System.Drawing.Point(1177, 872);
		this.CorrenteMin.Name = "CorrenteMin";
		this.CorrenteMin.Size = new System.Drawing.Size(45, 22);
		this.CorrenteMin.TabIndex = 50;
		this.CorrenteMin.Text = "4";
		this.CorrenteMin.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.CorrenteMin.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.CorrenteMin.Validating += new System.ComponentModel.CancelEventHandler(Validating_Float);
		this.label13.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label13.AutoSize = true;
		this.label13.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label13.Location = new System.Drawing.Point(1054, 778);
		this.label13.Name = "label13";
		this.label13.Size = new System.Drawing.Size(121, 20);
		this.label13.TabIndex = 49;
		this.label13.Text = "Corrente Max:";
		this.CorrenteMax.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.CorrenteMax.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.CorrenteMax.Location = new System.Drawing.Point(1181, 778);
		this.CorrenteMax.Name = "CorrenteMax";
		this.CorrenteMax.Size = new System.Drawing.Size(45, 22);
		this.CorrenteMax.TabIndex = 48;
		this.CorrenteMax.Text = "8";
		this.CorrenteMax.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.CorrenteMax.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.CorrenteMax.Validating += new System.ComponentModel.CancelEventHandler(Validating_Float);
		this.btnTerminal.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.btnTerminal.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.btnTerminal.Location = new System.Drawing.Point(1175, 1008);
		this.btnTerminal.Name = "btnTerminal";
		this.btnTerminal.Size = new System.Drawing.Size(95, 35);
		this.btnTerminal.TabIndex = 52;
		this.btnTerminal.Text = "Terminal";
		this.btnTerminal.UseVisualStyleBackColor = true;
		this.btnTerminal.Click += new System.EventHandler(Terminal_Click);
		this.Clear.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Clear.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Clear.Location = new System.Drawing.Point(1292, 1008);
		this.Clear.Name = "Clear";
		this.Clear.Size = new System.Drawing.Size(137, 35);
		this.Clear.TabIndex = 53;
		this.Clear.Text = "Clear Report";
		this.Clear.UseVisualStyleBackColor = true;
		this.Clear.Click += new System.EventHandler(Clear_Click);
		this.TimeOut.Interval = 5000;
		this.TimeOut.Tick += new System.EventHandler(TimeOut_Tick);
		this.Duplica.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Duplica.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Duplica.Location = new System.Drawing.Point(1451, 1008);
		this.Duplica.Name = "Duplica";
		this.Duplica.Size = new System.Drawing.Size(95, 35);
		this.Duplica.TabIndex = 56;
		this.Duplica.Text = "Duplica";
		this.Duplica.UseVisualStyleBackColor = true;
		this.Duplica.Click += new System.EventHandler(Duplica_Click);
		this.Elimina.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Elimina.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Elimina.Location = new System.Drawing.Point(1568, 1008);
		this.Elimina.Name = "Elimina";
		this.Elimina.Size = new System.Drawing.Size(95, 35);
		this.Elimina.TabIndex = 57;
		this.Elimina.Text = "Elimina";
		this.Elimina.UseVisualStyleBackColor = true;
		this.Elimina.Click += new System.EventHandler(Elimina_Click);
		this.Test1.Controls.Add(this.label23);
		this.Test1.Controls.Add(this.Pos1);
		this.Test1.Controls.Add(this.Testo1);
		this.Test1.Controls.Add(this.Val14);
		this.Test1.Controls.Add(this.Val13);
		this.Test1.Controls.Add(this.Val12);
		this.Test1.Controls.Add(this.Val11);
		this.Test1.Controls.Add(this.Cmp14);
		this.Test1.Controls.Add(this.Cmp13);
		this.Test1.Controls.Add(this.Cmp12);
		this.Test1.Controls.Add(this.Cmp11);
		this.Test1.Controls.Add(this.StopTest1);
		this.Test1.Controls.Add(this.Canale14);
		this.Test1.Controls.Add(this.Canale13);
		this.Test1.Controls.Add(this.Canale12);
		this.Test1.Controls.Add(this.Canale11);
		this.Test1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1.Location = new System.Drawing.Point(12, 547);
		this.Test1.Name = "Test1";
		this.Test1.Size = new System.Drawing.Size(254, 245);
		this.Test1.TabIndex = 58;
		this.Test1.TabStop = false;
		this.Test1.Text = "Test 1";
		this.label23.AutoSize = true;
		this.label23.Location = new System.Drawing.Point(156, 194);
		this.label23.Name = "label23";
		this.label23.Size = new System.Drawing.Size(44, 20);
		this.label23.TabIndex = 62;
		this.label23.Text = "Pos:";
		this.Pos1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos1.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos1.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos1.Location = new System.Drawing.Point(206, 192);
		this.Pos1.Name = "Pos1";
		this.Pos1.Size = new System.Drawing.Size(38, 24);
		this.Pos1.TabIndex = 61;
		this.Pos1.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo1.Location = new System.Drawing.Point(6, 22);
		this.Testo1.Name = "Testo1";
		this.Testo1.Size = new System.Drawing.Size(240, 26);
		this.Testo1.TabIndex = 60;
		this.Testo1.Text = "Oil outlet test";
		this.Val14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val14.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val14.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val14.Location = new System.Drawing.Point(154, 158);
		this.Val14.Name = "Val14";
		this.Val14.Size = new System.Drawing.Size(92, 24);
		this.Val14.TabIndex = 53;
		this.Val14.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val13.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val13.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val13.Location = new System.Drawing.Point(154, 123);
		this.Val13.Name = "Val13";
		this.Val13.Size = new System.Drawing.Size(92, 24);
		this.Val13.TabIndex = 52;
		this.Val13.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val12.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val12.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val12.Location = new System.Drawing.Point(154, 86);
		this.Val12.Name = "Val12";
		this.Val12.Size = new System.Drawing.Size(92, 24);
		this.Val12.TabIndex = 51;
		this.Val12.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val11.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val11.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val11.Location = new System.Drawing.Point(154, 50);
		this.Val11.Name = "Val11";
		this.Val11.Size = new System.Drawing.Size(92, 24);
		this.Val11.TabIndex = 50;
		this.Val11.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Cmp14.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp14.Location = new System.Drawing.Point(114, 159);
		this.Cmp14.Name = "Cmp14";
		this.Cmp14.Size = new System.Drawing.Size(34, 30);
		this.Cmp14.TabIndex = 57;
		this.Cmp14.Text = ">";
		this.Cmp14.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp13.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp13.Location = new System.Drawing.Point(114, 123);
		this.Cmp13.Name = "Cmp13";
		this.Cmp13.Size = new System.Drawing.Size(34, 30);
		this.Cmp13.TabIndex = 56;
		this.Cmp13.Text = ">";
		this.Cmp13.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp12.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp12.Location = new System.Drawing.Point(114, 87);
		this.Cmp12.Name = "Cmp12";
		this.Cmp12.Size = new System.Drawing.Size(34, 30);
		this.Cmp12.TabIndex = 55;
		this.Cmp12.Text = ">";
		this.Cmp12.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp11.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp11.Location = new System.Drawing.Point(114, 51);
		this.Cmp11.Name = "Cmp11";
		this.Cmp11.Size = new System.Drawing.Size(34, 30);
		this.Cmp11.TabIndex = 54;
		this.Cmp11.Text = ">";
		this.Cmp11.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.StopTest1.AutoSize = true;
		this.StopTest1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest1.Location = new System.Drawing.Point(6, 190);
		this.StopTest1.Name = "StopTest1";
		this.StopTest1.Size = new System.Drawing.Size(106, 24);
		this.StopTest1.TabIndex = 49;
		this.StopTest1.Text = "Stop Test";
		this.StopTest1.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale14.AutoSize = true;
		this.Canale14.Checked = true;
		this.Canale14.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale14.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale14.Location = new System.Drawing.Point(6, 158);
		this.Canale14.Name = "Canale14";
		this.Canale14.Size = new System.Drawing.Size(99, 24);
		this.Canale14.TabIndex = 45;
		this.Canale14.Text = "Canale 4";
		this.Canale14.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale13.AutoSize = true;
		this.Canale13.Checked = true;
		this.Canale13.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale13.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale13.Location = new System.Drawing.Point(6, 122);
		this.Canale13.Name = "Canale13";
		this.Canale13.Size = new System.Drawing.Size(99, 24);
		this.Canale13.TabIndex = 44;
		this.Canale13.Text = "Canale 3";
		this.Canale13.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale12.AutoSize = true;
		this.Canale12.Checked = true;
		this.Canale12.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale12.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale12.Location = new System.Drawing.Point(6, 86);
		this.Canale12.Name = "Canale12";
		this.Canale12.Size = new System.Drawing.Size(99, 24);
		this.Canale12.TabIndex = 43;
		this.Canale12.Text = "Canale 2";
		this.Canale12.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale11.AutoSize = true;
		this.Canale11.Checked = true;
		this.Canale11.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale11.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale11.Location = new System.Drawing.Point(6, 50);
		this.Canale11.Name = "Canale11";
		this.Canale11.Size = new System.Drawing.Size(99, 24);
		this.Canale11.TabIndex = 41;
		this.Canale11.Text = "Canale 1";
		this.Canale11.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.label18.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label18.AutoSize = true;
		this.label18.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label18.Location = new System.Drawing.Point(1054, 590);
		this.label18.Name = "label18";
		this.label18.Size = new System.Drawing.Size(146, 20);
		this.label18.TabIndex = 62;
		this.label18.Text = "Pressione lavoro:";
		this.PressioneLavoro.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneLavoro.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneLavoro.Location = new System.Drawing.Point(1206, 590);
		this.PressioneLavoro.Name = "PressioneLavoro";
		this.PressioneLavoro.Size = new System.Drawing.Size(45, 22);
		this.PressioneLavoro.TabIndex = 61;
		this.PressioneLavoro.Text = "200";
		this.PressioneLavoro.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.PressioneLavoro.TextChanged += new System.EventHandler(SelectedIndexChanged);
		this.label19.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label19.AutoSize = true;
		this.label19.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label19.Location = new System.Drawing.Point(1334, 9);
		this.label19.Name = "label19";
		this.label19.Size = new System.Drawing.Size(93, 20);
		this.label19.TabIndex = 64;
		this.label19.Text = "Sub Code:";
		this.txtSubCode.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.txtSubCode.BackColor = System.Drawing.SystemColors.ControlLightLight;
		this.txtSubCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.txtSubCode.Location = new System.Drawing.Point(1433, 9);
		this.txtSubCode.Name = "txtSubCode";
		this.txtSubCode.ReadOnly = true;
		this.txtSubCode.Size = new System.Drawing.Size(24, 22);
		this.txtSubCode.TabIndex = 65;
		this.txtSubCode.Text = "0";
		this.txtSubCode.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
		this.label14.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label14.AutoSize = true;
		this.label14.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label14.Location = new System.Drawing.Point(1144, 9);
		this.label14.Name = "label14";
		this.label14.Size = new System.Drawing.Size(110, 20);
		this.label14.TabIndex = 67;
		this.label14.Text = "Codice ABS:";
		this.CodiceABS.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.CodiceABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.CodiceABS.Location = new System.Drawing.Point(1267, 9);
		this.CodiceABS.Name = "CodiceABS";
		this.CodiceABS.Size = new System.Drawing.Size(45, 22);
		this.CodiceABS.TabIndex = 66;
		this.CodiceABS.Text = "0";
		this.CodiceABS.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.CodiceABS.TextChanged += new System.EventHandler(CodiceABS_TextChanged);
		this.CodiceABS.MouseDown += new System.Windows.Forms.MouseEventHandler(CodiceABS_MouseDown);
		this.CodiceABS.Validating += new System.ComponentModel.CancelEventHandler(CodiceABS_Validating);
		this.UpDateName.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.UpDateName.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.UpDateName.ImageAlign = System.Drawing.ContentAlignment.TopCenter;
		this.UpDateName.Location = new System.Drawing.Point(1051, 9);
		this.UpDateName.Name = "UpDateName";
		this.UpDateName.Size = new System.Drawing.Size(36, 24);
		this.UpDateName.TabIndex = 68;
		this.UpDateName.Text = ". .";
		this.UpDateName.UseVisualStyleBackColor = true;
		this.UpDateName.Click += new System.EventHandler(UpDateName_Click);
		this.Test6.Controls.Add(this.label29);
		this.Test6.Controls.Add(this.Pos6);
		this.Test6.Controls.Add(this.Testo6);
		this.Test6.Controls.Add(this.StopTest6);
		this.Test6.Controls.Add(this.ControlloPressioni6);
		this.Test6.Controls.Add(this.Val64);
		this.Test6.Controls.Add(this.Val63);
		this.Test6.Controls.Add(this.Val62);
		this.Test6.Controls.Add(this.Canale64);
		this.Test6.Controls.Add(this.Canale63);
		this.Test6.Controls.Add(this.Canale62);
		this.Test6.Controls.Add(this.Val61);
		this.Test6.Controls.Add(this.Canale61);
		this.Test6.Controls.Add(this.Cmp64);
		this.Test6.Controls.Add(this.Cmp63);
		this.Test6.Controls.Add(this.Cmp62);
		this.Test6.Controls.Add(this.Cmp61);
		this.Test6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6.Location = new System.Drawing.Point(532, 798);
		this.Test6.Name = "Test6";
		this.Test6.Size = new System.Drawing.Size(254, 245);
		this.Test6.TabIndex = 69;
		this.Test6.TabStop = false;
		this.Test6.Text = "Test 6";
		this.label29.AutoSize = true;
		this.label29.Location = new System.Drawing.Point(156, 194);
		this.label29.Name = "label29";
		this.label29.Size = new System.Drawing.Size(44, 20);
		this.label29.TabIndex = 71;
		this.label29.Text = "Pos:";
		this.Pos6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos6.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos6.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos6.Location = new System.Drawing.Point(206, 191);
		this.Pos6.Name = "Pos6";
		this.Pos6.Size = new System.Drawing.Size(38, 24);
		this.Pos6.TabIndex = 70;
		this.Pos6.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo6.Location = new System.Drawing.Point(6, 22);
		this.Testo6.Name = "Testo6";
		this.Testo6.Size = new System.Drawing.Size(240, 26);
		this.Testo6.TabIndex = 69;
		this.Testo6.Text = "Pedal retention test + ESP";
		this.StopTest6.AutoSize = true;
		this.StopTest6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest6.Location = new System.Drawing.Point(6, 190);
		this.StopTest6.Name = "StopTest6";
		this.StopTest6.Size = new System.Drawing.Size(106, 24);
		this.StopTest6.TabIndex = 48;
		this.StopTest6.Text = "Stop Test";
		this.ControlloPressioni6.AutoSize = true;
		this.ControlloPressioni6.Checked = true;
		this.ControlloPressioni6.CheckState = System.Windows.Forms.CheckState.Checked;
		this.ControlloPressioni6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ControlloPressioni6.Location = new System.Drawing.Point(6, 221);
		this.ControlloPressioni6.Name = "ControlloPressioni6";
		this.ControlloPressioni6.Size = new System.Drawing.Size(178, 24);
		this.ControlloPressioni6.TabIndex = 47;
		this.ControlloPressioni6.Text = "Controllo Pressioni";
		this.Val64.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val64.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val64.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val64.Location = new System.Drawing.Point(152, 158);
		this.Val64.Name = "Val64";
		this.Val64.Size = new System.Drawing.Size(92, 24);
		this.Val64.TabIndex = 7;
		this.Val64.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val63.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val63.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val63.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val63.Location = new System.Drawing.Point(152, 122);
		this.Val63.Name = "Val63";
		this.Val63.Size = new System.Drawing.Size(92, 24);
		this.Val63.TabIndex = 6;
		this.Val63.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val62.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val62.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val62.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val62.Location = new System.Drawing.Point(152, 86);
		this.Val62.Name = "Val62";
		this.Val62.Size = new System.Drawing.Size(92, 24);
		this.Val62.TabIndex = 5;
		this.Val62.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale64.AutoSize = true;
		this.Canale64.Checked = true;
		this.Canale64.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale64.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale64.Location = new System.Drawing.Point(6, 158);
		this.Canale64.Name = "Canale64";
		this.Canale64.Size = new System.Drawing.Size(104, 24);
		this.Canale64.TabIndex = 45;
		this.Canale64.Text = "Canale 4:";
		this.Canale63.AutoSize = true;
		this.Canale63.Checked = true;
		this.Canale63.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale63.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale63.Location = new System.Drawing.Point(6, 122);
		this.Canale63.Name = "Canale63";
		this.Canale63.Size = new System.Drawing.Size(104, 24);
		this.Canale63.TabIndex = 44;
		this.Canale63.Text = "Canale 3:";
		this.Canale62.AutoSize = true;
		this.Canale62.Checked = true;
		this.Canale62.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale62.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale62.Location = new System.Drawing.Point(6, 86);
		this.Canale62.Name = "Canale62";
		this.Canale62.Size = new System.Drawing.Size(104, 24);
		this.Canale62.TabIndex = 43;
		this.Canale62.Text = "Canale 2:";
		this.Val61.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val61.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val61.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val61.Location = new System.Drawing.Point(152, 50);
		this.Val61.Name = "Val61";
		this.Val61.Size = new System.Drawing.Size(92, 24);
		this.Val61.TabIndex = 4;
		this.Val61.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale61.AutoSize = true;
		this.Canale61.Checked = true;
		this.Canale61.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale61.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale61.Location = new System.Drawing.Point(6, 50);
		this.Canale61.Name = "Canale61";
		this.Canale61.Size = new System.Drawing.Size(104, 24);
		this.Canale61.TabIndex = 41;
		this.Canale61.Text = "Canale 1:";
		this.Cmp64.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp64.Location = new System.Drawing.Point(114, 158);
		this.Cmp64.Name = "Cmp64";
		this.Cmp64.Size = new System.Drawing.Size(34, 30);
		this.Cmp64.TabIndex = 40;
		this.Cmp64.Text = ">";
		this.Cmp64.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp63.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp63.Location = new System.Drawing.Point(114, 122);
		this.Cmp63.Name = "Cmp63";
		this.Cmp63.Size = new System.Drawing.Size(34, 30);
		this.Cmp63.TabIndex = 39;
		this.Cmp63.Text = ">";
		this.Cmp63.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp62.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp62.Location = new System.Drawing.Point(114, 86);
		this.Cmp62.Name = "Cmp62";
		this.Cmp62.Size = new System.Drawing.Size(34, 30);
		this.Cmp62.TabIndex = 38;
		this.Cmp62.Text = ">";
		this.Cmp62.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp61.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp61.Location = new System.Drawing.Point(114, 50);
		this.Cmp61.Name = "Cmp61";
		this.Cmp61.Size = new System.Drawing.Size(34, 30);
		this.Cmp61.TabIndex = 37;
		this.Cmp61.Text = ">";
		this.Cmp61.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Valvole6.Controls.Add(this.Test6V16);
		this.Valvole6.Controls.Add(this.Test6V15);
		this.Valvole6.Controls.Add(this.Test6V14);
		this.Valvole6.Controls.Add(this.Test6V13);
		this.Valvole6.Controls.Add(this.Test6V12);
		this.Valvole6.Controls.Add(this.Test6V1);
		this.Valvole6.Controls.Add(this.Test6V2);
		this.Valvole6.Controls.Add(this.Test6V3);
		this.Valvole6.Controls.Add(this.Test6V4);
		this.Valvole6.Controls.Add(this.Test6V5);
		this.Valvole6.Controls.Add(this.Test6V6);
		this.Valvole6.Controls.Add(this.Test6V7);
		this.Valvole6.Controls.Add(this.Test6V8);
		this.Valvole6.Controls.Add(this.Test6V9);
		this.Valvole6.Controls.Add(this.Test6V10);
		this.Valvole6.Controls.Add(this.Test6V11);
		this.Valvole6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole6.Location = new System.Drawing.Point(4, 371);
		this.Valvole6.Name = "Valvole6";
		this.Valvole6.Size = new System.Drawing.Size(712, 55);
		this.Valvole6.TabIndex = 70;
		this.Valvole6.TabStop = false;
		this.Valvole6.Text = "Valvole Test 6";
		this.Test6V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V16.FormattingEnabled = true;
		this.Test6V16.Location = new System.Drawing.Point(385, 12);
		this.Test6V16.Name = "Test6V16";
		this.Test6V16.Size = new System.Drawing.Size(43, 21);
		this.Test6V16.TabIndex = 19;
		this.Test6V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V15.FormattingEnabled = true;
		this.Test6V15.Location = new System.Drawing.Point(335, 12);
		this.Test6V15.Name = "Test6V15";
		this.Test6V15.Size = new System.Drawing.Size(43, 21);
		this.Test6V15.TabIndex = 18;
		this.Test6V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V14.FormattingEnabled = true;
		this.Test6V14.Location = new System.Drawing.Point(285, 12);
		this.Test6V14.Name = "Test6V14";
		this.Test6V14.Size = new System.Drawing.Size(43, 21);
		this.Test6V14.TabIndex = 17;
		this.Test6V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V13.FormattingEnabled = true;
		this.Test6V13.Location = new System.Drawing.Point(606, 26);
		this.Test6V13.Name = "Test6V13";
		this.Test6V13.Size = new System.Drawing.Size(43, 21);
		this.Test6V13.TabIndex = 14;
		this.Test6V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V12.FormattingEnabled = true;
		this.Test6V12.Location = new System.Drawing.Point(556, 26);
		this.Test6V12.Name = "Test6V12";
		this.Test6V12.Size = new System.Drawing.Size(43, 21);
		this.Test6V12.TabIndex = 12;
		this.Test6V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V1.FormattingEnabled = true;
		this.Test6V1.Location = new System.Drawing.Point(6, 26);
		this.Test6V1.Name = "Test6V1";
		this.Test6V1.Size = new System.Drawing.Size(43, 21);
		this.Test6V1.TabIndex = 1;
		this.Test6V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V2.FormattingEnabled = true;
		this.Test6V2.Location = new System.Drawing.Point(56, 26);
		this.Test6V2.Name = "Test6V2";
		this.Test6V2.Size = new System.Drawing.Size(43, 21);
		this.Test6V2.TabIndex = 2;
		this.Test6V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V3.FormattingEnabled = true;
		this.Test6V3.Location = new System.Drawing.Point(106, 26);
		this.Test6V3.Name = "Test6V3";
		this.Test6V3.Size = new System.Drawing.Size(43, 21);
		this.Test6V3.TabIndex = 3;
		this.Test6V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V4.FormattingEnabled = true;
		this.Test6V4.Location = new System.Drawing.Point(156, 26);
		this.Test6V4.Name = "Test6V4";
		this.Test6V4.Size = new System.Drawing.Size(43, 21);
		this.Test6V4.TabIndex = 4;
		this.Test6V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V5.FormattingEnabled = true;
		this.Test6V5.Location = new System.Drawing.Point(206, 26);
		this.Test6V5.Name = "Test6V5";
		this.Test6V5.Size = new System.Drawing.Size(43, 21);
		this.Test6V5.TabIndex = 5;
		this.Test6V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V6.FormattingEnabled = true;
		this.Test6V6.Location = new System.Drawing.Point(256, 26);
		this.Test6V6.Name = "Test6V6";
		this.Test6V6.Size = new System.Drawing.Size(43, 21);
		this.Test6V6.TabIndex = 6;
		this.Test6V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V7.FormattingEnabled = true;
		this.Test6V7.Location = new System.Drawing.Point(306, 26);
		this.Test6V7.Name = "Test6V7";
		this.Test6V7.Size = new System.Drawing.Size(43, 21);
		this.Test6V7.TabIndex = 7;
		this.Test6V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V8.FormattingEnabled = true;
		this.Test6V8.Location = new System.Drawing.Point(356, 26);
		this.Test6V8.Name = "Test6V8";
		this.Test6V8.Size = new System.Drawing.Size(43, 21);
		this.Test6V8.TabIndex = 8;
		this.Test6V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V9.FormattingEnabled = true;
		this.Test6V9.Location = new System.Drawing.Point(406, 26);
		this.Test6V9.Name = "Test6V9";
		this.Test6V9.Size = new System.Drawing.Size(43, 21);
		this.Test6V9.TabIndex = 9;
		this.Test6V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V10.FormattingEnabled = true;
		this.Test6V10.Location = new System.Drawing.Point(456, 26);
		this.Test6V10.Name = "Test6V10";
		this.Test6V10.Size = new System.Drawing.Size(43, 21);
		this.Test6V10.TabIndex = 10;
		this.Test6V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test6V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test6V11.FormattingEnabled = true;
		this.Test6V11.Location = new System.Drawing.Point(506, 26);
		this.Test6V11.Name = "Test6V11";
		this.Test6V11.Size = new System.Drawing.Size(43, 21);
		this.Test6V11.TabIndex = 11;
		this.Valvole7.Controls.Add(this.Test7V16);
		this.Valvole7.Controls.Add(this.Test7V15);
		this.Valvole7.Controls.Add(this.Test7V14);
		this.Valvole7.Controls.Add(this.Test7V13);
		this.Valvole7.Controls.Add(this.Test7V12);
		this.Valvole7.Controls.Add(this.Test7V1);
		this.Valvole7.Controls.Add(this.Test7V2);
		this.Valvole7.Controls.Add(this.Test7V3);
		this.Valvole7.Controls.Add(this.Test7V4);
		this.Valvole7.Controls.Add(this.Test7V5);
		this.Valvole7.Controls.Add(this.Test7V6);
		this.Valvole7.Controls.Add(this.Test7V7);
		this.Valvole7.Controls.Add(this.Test7V8);
		this.Valvole7.Controls.Add(this.Test7V9);
		this.Valvole7.Controls.Add(this.Test7V10);
		this.Valvole7.Controls.Add(this.Test7V11);
		this.Valvole7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole7.Location = new System.Drawing.Point(4, 426);
		this.Valvole7.Name = "Valvole7";
		this.Valvole7.Size = new System.Drawing.Size(712, 55);
		this.Valvole7.TabIndex = 71;
		this.Valvole7.TabStop = false;
		this.Valvole7.Text = "Valvole Test 7";
		this.Test7V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V16.FormattingEnabled = true;
		this.Test7V16.Location = new System.Drawing.Point(385, 11);
		this.Test7V16.Name = "Test7V16";
		this.Test7V16.Size = new System.Drawing.Size(43, 21);
		this.Test7V16.TabIndex = 19;
		this.Test7V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V15.FormattingEnabled = true;
		this.Test7V15.Location = new System.Drawing.Point(335, 11);
		this.Test7V15.Name = "Test7V15";
		this.Test7V15.Size = new System.Drawing.Size(43, 21);
		this.Test7V15.TabIndex = 18;
		this.Test7V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V14.FormattingEnabled = true;
		this.Test7V14.Location = new System.Drawing.Point(285, 11);
		this.Test7V14.Name = "Test7V14";
		this.Test7V14.Size = new System.Drawing.Size(43, 21);
		this.Test7V14.TabIndex = 17;
		this.Test7V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V13.FormattingEnabled = true;
		this.Test7V13.Location = new System.Drawing.Point(606, 26);
		this.Test7V13.Name = "Test7V13";
		this.Test7V13.Size = new System.Drawing.Size(43, 21);
		this.Test7V13.TabIndex = 14;
		this.Test7V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V12.FormattingEnabled = true;
		this.Test7V12.Location = new System.Drawing.Point(556, 26);
		this.Test7V12.Name = "Test7V12";
		this.Test7V12.Size = new System.Drawing.Size(43, 21);
		this.Test7V12.TabIndex = 12;
		this.Test7V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V1.FormattingEnabled = true;
		this.Test7V1.Location = new System.Drawing.Point(6, 26);
		this.Test7V1.Name = "Test7V1";
		this.Test7V1.Size = new System.Drawing.Size(43, 21);
		this.Test7V1.TabIndex = 1;
		this.Test7V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V2.FormattingEnabled = true;
		this.Test7V2.Location = new System.Drawing.Point(56, 26);
		this.Test7V2.Name = "Test7V2";
		this.Test7V2.Size = new System.Drawing.Size(43, 21);
		this.Test7V2.TabIndex = 2;
		this.Test7V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V3.FormattingEnabled = true;
		this.Test7V3.Location = new System.Drawing.Point(106, 26);
		this.Test7V3.Name = "Test7V3";
		this.Test7V3.Size = new System.Drawing.Size(43, 21);
		this.Test7V3.TabIndex = 3;
		this.Test7V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V4.FormattingEnabled = true;
		this.Test7V4.Location = new System.Drawing.Point(156, 26);
		this.Test7V4.Name = "Test7V4";
		this.Test7V4.Size = new System.Drawing.Size(43, 21);
		this.Test7V4.TabIndex = 4;
		this.Test7V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V5.FormattingEnabled = true;
		this.Test7V5.Location = new System.Drawing.Point(206, 26);
		this.Test7V5.Name = "Test7V5";
		this.Test7V5.Size = new System.Drawing.Size(43, 21);
		this.Test7V5.TabIndex = 5;
		this.Test7V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V6.FormattingEnabled = true;
		this.Test7V6.Location = new System.Drawing.Point(256, 26);
		this.Test7V6.Name = "Test7V6";
		this.Test7V6.Size = new System.Drawing.Size(43, 21);
		this.Test7V6.TabIndex = 6;
		this.Test7V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V7.FormattingEnabled = true;
		this.Test7V7.Location = new System.Drawing.Point(306, 26);
		this.Test7V7.Name = "Test7V7";
		this.Test7V7.Size = new System.Drawing.Size(43, 21);
		this.Test7V7.TabIndex = 7;
		this.Test7V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V8.FormattingEnabled = true;
		this.Test7V8.Location = new System.Drawing.Point(356, 26);
		this.Test7V8.Name = "Test7V8";
		this.Test7V8.Size = new System.Drawing.Size(43, 21);
		this.Test7V8.TabIndex = 8;
		this.Test7V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V9.FormattingEnabled = true;
		this.Test7V9.Location = new System.Drawing.Point(406, 26);
		this.Test7V9.Name = "Test7V9";
		this.Test7V9.Size = new System.Drawing.Size(43, 21);
		this.Test7V9.TabIndex = 9;
		this.Test7V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V10.FormattingEnabled = true;
		this.Test7V10.Location = new System.Drawing.Point(456, 26);
		this.Test7V10.Name = "Test7V10";
		this.Test7V10.Size = new System.Drawing.Size(43, 21);
		this.Test7V10.TabIndex = 10;
		this.Test7V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test7V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7V11.FormattingEnabled = true;
		this.Test7V11.Location = new System.Drawing.Point(506, 26);
		this.Test7V11.Name = "Test7V11";
		this.Test7V11.Size = new System.Drawing.Size(43, 21);
		this.Test7V11.TabIndex = 11;
		this.Valvole8.Controls.Add(this.Test8V16);
		this.Valvole8.Controls.Add(this.Test8V15);
		this.Valvole8.Controls.Add(this.Test8V14);
		this.Valvole8.Controls.Add(this.Test8V13);
		this.Valvole8.Controls.Add(this.Test8V12);
		this.Valvole8.Controls.Add(this.Test8V1);
		this.Valvole8.Controls.Add(this.Test8V2);
		this.Valvole8.Controls.Add(this.Test8V3);
		this.Valvole8.Controls.Add(this.Test8V4);
		this.Valvole8.Controls.Add(this.Test8V5);
		this.Valvole8.Controls.Add(this.Test8V6);
		this.Valvole8.Controls.Add(this.Test8V7);
		this.Valvole8.Controls.Add(this.Test8V8);
		this.Valvole8.Controls.Add(this.Test8V9);
		this.Valvole8.Controls.Add(this.Test8V10);
		this.Valvole8.Controls.Add(this.Test8V11);
		this.Valvole8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole8.Location = new System.Drawing.Point(4, 481);
		this.Valvole8.Name = "Valvole8";
		this.Valvole8.Size = new System.Drawing.Size(712, 55);
		this.Valvole8.TabIndex = 72;
		this.Valvole8.TabStop = false;
		this.Valvole8.Text = "Valvole Test 8";
		this.Test8V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V16.FormattingEnabled = true;
		this.Test8V16.Location = new System.Drawing.Point(385, 10);
		this.Test8V16.Name = "Test8V16";
		this.Test8V16.Size = new System.Drawing.Size(43, 21);
		this.Test8V16.TabIndex = 19;
		this.Test8V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V15.FormattingEnabled = true;
		this.Test8V15.Location = new System.Drawing.Point(335, 10);
		this.Test8V15.Name = "Test8V15";
		this.Test8V15.Size = new System.Drawing.Size(43, 21);
		this.Test8V15.TabIndex = 18;
		this.Test8V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V14.FormattingEnabled = true;
		this.Test8V14.Location = new System.Drawing.Point(285, 10);
		this.Test8V14.Name = "Test8V14";
		this.Test8V14.Size = new System.Drawing.Size(43, 21);
		this.Test8V14.TabIndex = 17;
		this.Test8V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V13.FormattingEnabled = true;
		this.Test8V13.Location = new System.Drawing.Point(606, 26);
		this.Test8V13.Name = "Test8V13";
		this.Test8V13.Size = new System.Drawing.Size(43, 21);
		this.Test8V13.TabIndex = 14;
		this.Test8V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V12.FormattingEnabled = true;
		this.Test8V12.Location = new System.Drawing.Point(556, 26);
		this.Test8V12.Name = "Test8V12";
		this.Test8V12.Size = new System.Drawing.Size(43, 21);
		this.Test8V12.TabIndex = 12;
		this.Test8V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V1.FormattingEnabled = true;
		this.Test8V1.Location = new System.Drawing.Point(6, 26);
		this.Test8V1.Name = "Test8V1";
		this.Test8V1.Size = new System.Drawing.Size(43, 21);
		this.Test8V1.TabIndex = 1;
		this.Test8V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V2.FormattingEnabled = true;
		this.Test8V2.Location = new System.Drawing.Point(56, 26);
		this.Test8V2.Name = "Test8V2";
		this.Test8V2.Size = new System.Drawing.Size(43, 21);
		this.Test8V2.TabIndex = 2;
		this.Test8V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V3.FormattingEnabled = true;
		this.Test8V3.Location = new System.Drawing.Point(106, 26);
		this.Test8V3.Name = "Test8V3";
		this.Test8V3.Size = new System.Drawing.Size(43, 21);
		this.Test8V3.TabIndex = 3;
		this.Test8V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V4.FormattingEnabled = true;
		this.Test8V4.Location = new System.Drawing.Point(156, 26);
		this.Test8V4.Name = "Test8V4";
		this.Test8V4.Size = new System.Drawing.Size(43, 21);
		this.Test8V4.TabIndex = 4;
		this.Test8V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V5.FormattingEnabled = true;
		this.Test8V5.Location = new System.Drawing.Point(206, 26);
		this.Test8V5.Name = "Test8V5";
		this.Test8V5.Size = new System.Drawing.Size(43, 21);
		this.Test8V5.TabIndex = 5;
		this.Test8V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V6.FormattingEnabled = true;
		this.Test8V6.Location = new System.Drawing.Point(256, 26);
		this.Test8V6.Name = "Test8V6";
		this.Test8V6.Size = new System.Drawing.Size(43, 21);
		this.Test8V6.TabIndex = 6;
		this.Test8V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V7.FormattingEnabled = true;
		this.Test8V7.Location = new System.Drawing.Point(306, 26);
		this.Test8V7.Name = "Test8V7";
		this.Test8V7.Size = new System.Drawing.Size(43, 21);
		this.Test8V7.TabIndex = 7;
		this.Test8V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V8.FormattingEnabled = true;
		this.Test8V8.Location = new System.Drawing.Point(356, 26);
		this.Test8V8.Name = "Test8V8";
		this.Test8V8.Size = new System.Drawing.Size(43, 21);
		this.Test8V8.TabIndex = 8;
		this.Test8V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V9.FormattingEnabled = true;
		this.Test8V9.Location = new System.Drawing.Point(406, 26);
		this.Test8V9.Name = "Test8V9";
		this.Test8V9.Size = new System.Drawing.Size(43, 21);
		this.Test8V9.TabIndex = 9;
		this.Test8V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V10.FormattingEnabled = true;
		this.Test8V10.Location = new System.Drawing.Point(456, 26);
		this.Test8V10.Name = "Test8V10";
		this.Test8V10.Size = new System.Drawing.Size(43, 21);
		this.Test8V10.TabIndex = 10;
		this.Test8V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test8V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8V11.FormattingEnabled = true;
		this.Test8V11.Location = new System.Drawing.Point(506, 26);
		this.Test8V11.Name = "Test8V11";
		this.Test8V11.Size = new System.Drawing.Size(43, 21);
		this.Test8V11.TabIndex = 11;
		this.Test8.Controls.Add(this.label30);
		this.Test8.Controls.Add(this.Pos8);
		this.Test8.Controls.Add(this.Testo8);
		this.Test8.Controls.Add(this.StopTest8);
		this.Test8.Controls.Add(this.ControlloPressioni8);
		this.Test8.Controls.Add(this.Val84);
		this.Test8.Controls.Add(this.Val83);
		this.Test8.Controls.Add(this.Val82);
		this.Test8.Controls.Add(this.Canale84);
		this.Test8.Controls.Add(this.Canale83);
		this.Test8.Controls.Add(this.Canale82);
		this.Test8.Controls.Add(this.Val81);
		this.Test8.Controls.Add(this.Canale81);
		this.Test8.Controls.Add(this.Cmp84);
		this.Test8.Controls.Add(this.Cmp83);
		this.Test8.Controls.Add(this.Cmp82);
		this.Test8.Controls.Add(this.Cmp81);
		this.Test8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test8.Location = new System.Drawing.Point(792, 798);
		this.Test8.Name = "Test8";
		this.Test8.Size = new System.Drawing.Size(254, 245);
		this.Test8.TabIndex = 74;
		this.Test8.TabStop = false;
		this.Test8.Text = "Test 8";
		this.label30.AutoSize = true;
		this.label30.Location = new System.Drawing.Point(156, 194);
		this.label30.Name = "label30";
		this.label30.Size = new System.Drawing.Size(44, 20);
		this.label30.TabIndex = 72;
		this.label30.Text = "Pos:";
		this.Pos8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos8.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos8.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos8.Location = new System.Drawing.Point(205, 191);
		this.Pos8.Name = "Pos8";
		this.Pos8.Size = new System.Drawing.Size(38, 24);
		this.Pos8.TabIndex = 71;
		this.Pos8.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo8.Location = new System.Drawing.Point(6, 22);
		this.Testo8.Name = "Testo8";
		this.Testo8.Size = new System.Drawing.Size(240, 26);
		this.Testo8.TabIndex = 70;
		this.Testo8.Text = "Pedal retention test + ESP";
		this.StopTest8.AutoSize = true;
		this.StopTest8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest8.Location = new System.Drawing.Point(6, 190);
		this.StopTest8.Name = "StopTest8";
		this.StopTest8.Size = new System.Drawing.Size(106, 24);
		this.StopTest8.TabIndex = 48;
		this.StopTest8.Text = "Stop Test";
		this.ControlloPressioni8.AutoSize = true;
		this.ControlloPressioni8.Checked = true;
		this.ControlloPressioni8.CheckState = System.Windows.Forms.CheckState.Checked;
		this.ControlloPressioni8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ControlloPressioni8.Location = new System.Drawing.Point(6, 221);
		this.ControlloPressioni8.Name = "ControlloPressioni8";
		this.ControlloPressioni8.Size = new System.Drawing.Size(178, 24);
		this.ControlloPressioni8.TabIndex = 47;
		this.ControlloPressioni8.Text = "Controllo Pressioni";
		this.Val84.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val84.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val84.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val84.Location = new System.Drawing.Point(152, 158);
		this.Val84.Name = "Val84";
		this.Val84.Size = new System.Drawing.Size(92, 24);
		this.Val84.TabIndex = 7;
		this.Val84.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val83.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val83.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val83.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val83.Location = new System.Drawing.Point(152, 122);
		this.Val83.Name = "Val83";
		this.Val83.Size = new System.Drawing.Size(92, 24);
		this.Val83.TabIndex = 6;
		this.Val83.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val82.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val82.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val82.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val82.Location = new System.Drawing.Point(152, 86);
		this.Val82.Name = "Val82";
		this.Val82.Size = new System.Drawing.Size(92, 24);
		this.Val82.TabIndex = 5;
		this.Val82.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale84.AutoSize = true;
		this.Canale84.Checked = true;
		this.Canale84.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale84.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale84.Location = new System.Drawing.Point(6, 158);
		this.Canale84.Name = "Canale84";
		this.Canale84.Size = new System.Drawing.Size(104, 24);
		this.Canale84.TabIndex = 45;
		this.Canale84.Text = "Canale 4:";
		this.Canale83.AutoSize = true;
		this.Canale83.Checked = true;
		this.Canale83.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale83.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale83.Location = new System.Drawing.Point(6, 122);
		this.Canale83.Name = "Canale83";
		this.Canale83.Size = new System.Drawing.Size(104, 24);
		this.Canale83.TabIndex = 44;
		this.Canale83.Text = "Canale 3:";
		this.Canale82.AutoSize = true;
		this.Canale82.Checked = true;
		this.Canale82.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale82.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale82.Location = new System.Drawing.Point(6, 86);
		this.Canale82.Name = "Canale82";
		this.Canale82.Size = new System.Drawing.Size(104, 24);
		this.Canale82.TabIndex = 43;
		this.Canale82.Text = "Canale 2:";
		this.Val81.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val81.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val81.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val81.Location = new System.Drawing.Point(152, 50);
		this.Val81.Name = "Val81";
		this.Val81.Size = new System.Drawing.Size(92, 24);
		this.Val81.TabIndex = 4;
		this.Val81.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale81.AutoSize = true;
		this.Canale81.Checked = true;
		this.Canale81.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale81.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale81.Location = new System.Drawing.Point(6, 50);
		this.Canale81.Name = "Canale81";
		this.Canale81.Size = new System.Drawing.Size(104, 24);
		this.Canale81.TabIndex = 41;
		this.Canale81.Text = "Canale 1:";
		this.Cmp84.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp84.Location = new System.Drawing.Point(114, 158);
		this.Cmp84.Name = "Cmp84";
		this.Cmp84.Size = new System.Drawing.Size(34, 30);
		this.Cmp84.TabIndex = 40;
		this.Cmp84.Text = ">";
		this.Cmp84.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp83.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp83.Location = new System.Drawing.Point(114, 122);
		this.Cmp83.Name = "Cmp83";
		this.Cmp83.Size = new System.Drawing.Size(34, 30);
		this.Cmp83.TabIndex = 39;
		this.Cmp83.Text = ">";
		this.Cmp83.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp82.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp82.Location = new System.Drawing.Point(114, 86);
		this.Cmp82.Name = "Cmp82";
		this.Cmp82.Size = new System.Drawing.Size(34, 30);
		this.Cmp82.TabIndex = 38;
		this.Cmp82.Text = ">";
		this.Cmp82.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp81.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp81.Location = new System.Drawing.Point(114, 50);
		this.Cmp81.Name = "Cmp81";
		this.Cmp81.Size = new System.Drawing.Size(34, 30);
		this.Cmp81.TabIndex = 37;
		this.Cmp81.Text = ">";
		this.Cmp81.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Test7.Controls.Add(this.label26);
		this.Test7.Controls.Add(this.Pos7);
		this.Test7.Controls.Add(this.Testo7);
		this.Test7.Controls.Add(this.StopTest7);
		this.Test7.Controls.Add(this.ControlloPressioni7);
		this.Test7.Controls.Add(this.Val74);
		this.Test7.Controls.Add(this.Val73);
		this.Test7.Controls.Add(this.Val72);
		this.Test7.Controls.Add(this.Canale74);
		this.Test7.Controls.Add(this.Canale73);
		this.Test7.Controls.Add(this.Canale72);
		this.Test7.Controls.Add(this.Val71);
		this.Test7.Controls.Add(this.Canale71);
		this.Test7.Controls.Add(this.Cmp74);
		this.Test7.Controls.Add(this.Cmp73);
		this.Test7.Controls.Add(this.Cmp72);
		this.Test7.Controls.Add(this.Cmp71);
		this.Test7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test7.Location = new System.Drawing.Point(792, 547);
		this.Test7.Name = "Test7";
		this.Test7.Size = new System.Drawing.Size(254, 245);
		this.Test7.TabIndex = 73;
		this.Test7.TabStop = false;
		this.Test7.Text = "Test 7";
		this.label26.AutoSize = true;
		this.label26.Location = new System.Drawing.Point(156, 194);
		this.label26.Name = "label26";
		this.label26.Size = new System.Drawing.Size(44, 20);
		this.label26.TabIndex = 65;
		this.label26.Text = "Pos:";
		this.Pos7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos7.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos7.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos7.Location = new System.Drawing.Point(205, 192);
		this.Pos7.Name = "Pos7";
		this.Pos7.Size = new System.Drawing.Size(38, 24);
		this.Pos7.TabIndex = 64;
		this.Pos7.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo7.Location = new System.Drawing.Point(6, 22);
		this.Testo7.Name = "Testo7";
		this.Testo7.Size = new System.Drawing.Size(240, 26);
		this.Testo7.TabIndex = 63;
		this.Testo7.Text = "Pedal retention test + ESP";
		this.StopTest7.AutoSize = true;
		this.StopTest7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest7.Location = new System.Drawing.Point(6, 190);
		this.StopTest7.Name = "StopTest7";
		this.StopTest7.Size = new System.Drawing.Size(106, 24);
		this.StopTest7.TabIndex = 48;
		this.StopTest7.Text = "Stop Test";
		this.ControlloPressioni7.AutoSize = true;
		this.ControlloPressioni7.Checked = true;
		this.ControlloPressioni7.CheckState = System.Windows.Forms.CheckState.Checked;
		this.ControlloPressioni7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ControlloPressioni7.Location = new System.Drawing.Point(6, 221);
		this.ControlloPressioni7.Name = "ControlloPressioni7";
		this.ControlloPressioni7.Size = new System.Drawing.Size(178, 24);
		this.ControlloPressioni7.TabIndex = 47;
		this.ControlloPressioni7.Text = "Controllo Pressioni";
		this.Val74.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val74.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val74.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val74.Location = new System.Drawing.Point(152, 158);
		this.Val74.Name = "Val74";
		this.Val74.Size = new System.Drawing.Size(92, 24);
		this.Val74.TabIndex = 7;
		this.Val74.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val73.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val73.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val73.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val73.Location = new System.Drawing.Point(152, 122);
		this.Val73.Name = "Val73";
		this.Val73.Size = new System.Drawing.Size(92, 24);
		this.Val73.TabIndex = 6;
		this.Val73.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val72.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val72.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val72.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val72.Location = new System.Drawing.Point(152, 86);
		this.Val72.Name = "Val72";
		this.Val72.Size = new System.Drawing.Size(92, 24);
		this.Val72.TabIndex = 5;
		this.Val72.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale74.AutoSize = true;
		this.Canale74.Checked = true;
		this.Canale74.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale74.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale74.Location = new System.Drawing.Point(6, 158);
		this.Canale74.Name = "Canale74";
		this.Canale74.Size = new System.Drawing.Size(104, 24);
		this.Canale74.TabIndex = 45;
		this.Canale74.Text = "Canale 4:";
		this.Canale73.AutoSize = true;
		this.Canale73.Checked = true;
		this.Canale73.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale73.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale73.Location = new System.Drawing.Point(6, 122);
		this.Canale73.Name = "Canale73";
		this.Canale73.Size = new System.Drawing.Size(104, 24);
		this.Canale73.TabIndex = 44;
		this.Canale73.Text = "Canale 3:";
		this.Canale72.AutoSize = true;
		this.Canale72.Checked = true;
		this.Canale72.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale72.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale72.Location = new System.Drawing.Point(6, 86);
		this.Canale72.Name = "Canale72";
		this.Canale72.Size = new System.Drawing.Size(104, 24);
		this.Canale72.TabIndex = 43;
		this.Canale72.Text = "Canale 2:";
		this.Val71.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val71.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val71.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val71.Location = new System.Drawing.Point(152, 50);
		this.Val71.Name = "Val71";
		this.Val71.Size = new System.Drawing.Size(92, 24);
		this.Val71.TabIndex = 4;
		this.Val71.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Canale71.AutoSize = true;
		this.Canale71.Checked = true;
		this.Canale71.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale71.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale71.Location = new System.Drawing.Point(6, 50);
		this.Canale71.Name = "Canale71";
		this.Canale71.Size = new System.Drawing.Size(104, 24);
		this.Canale71.TabIndex = 41;
		this.Canale71.Text = "Canale 1:";
		this.Cmp74.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp74.Location = new System.Drawing.Point(114, 158);
		this.Cmp74.Name = "Cmp74";
		this.Cmp74.Size = new System.Drawing.Size(34, 30);
		this.Cmp74.TabIndex = 40;
		this.Cmp74.Text = ">";
		this.Cmp74.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp73.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp73.Location = new System.Drawing.Point(114, 122);
		this.Cmp73.Name = "Cmp73";
		this.Cmp73.Size = new System.Drawing.Size(34, 30);
		this.Cmp73.TabIndex = 39;
		this.Cmp73.Text = ">";
		this.Cmp73.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp72.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp72.Location = new System.Drawing.Point(114, 86);
		this.Cmp72.Name = "Cmp72";
		this.Cmp72.Size = new System.Drawing.Size(34, 30);
		this.Cmp72.TabIndex = 38;
		this.Cmp72.Text = ">";
		this.Cmp72.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp71.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp71.Location = new System.Drawing.Point(114, 50);
		this.Cmp71.Name = "Cmp71";
		this.Cmp71.Size = new System.Drawing.Size(34, 30);
		this.Cmp71.TabIndex = 37;
		this.Cmp71.Text = ">";
		this.Cmp71.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.label20.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label20.AutoSize = true;
		this.label20.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label20.Location = new System.Drawing.Point(1265, 590);
		this.label20.Name = "label20";
		this.label20.Size = new System.Drawing.Size(218, 20);
		this.label20.TabIndex = 76;
		this.label20.Text = "Pressione inizializzazione:";
		this.PressioneInizializzazione.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneInizializzazione.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneInizializzazione.Location = new System.Drawing.Point(1489, 590);
		this.PressioneInizializzazione.Name = "PressioneInizializzazione";
		this.PressioneInizializzazione.Size = new System.Drawing.Size(45, 22);
		this.PressioneInizializzazione.TabIndex = 75;
		this.PressioneInizializzazione.Text = "120";
		this.PressioneInizializzazione.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.TestFault.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestFault.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.TestFault.Items.AddRange(new object[9] { "Default", "1", "2", "3", "4", "5", "6", "7", "8" });
		this.TestFault.Location = new System.Drawing.Point(1618, 9);
		this.TestFault.Name = "TestFault";
		this.TestFault.Size = new System.Drawing.Size(92, 24);
		this.TestFault.TabIndex = 5;
		this.TestFault.SelectedIndexChanged += new System.EventHandler(TestFaul_SelectedIndexChanged);
		this.CanaleFault.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.CanaleFault.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.CanaleFault.Items.AddRange(new object[5] { "NULL", "1", "2", "3", "4" });
		this.CanaleFault.Location = new System.Drawing.Point(1803, 9);
		this.CanaleFault.Name = "CanaleFault";
		this.CanaleFault.Size = new System.Drawing.Size(92, 24);
		this.CanaleFault.TabIndex = 6;
		this.CanaleFault.SelectedIndexChanged += new System.EventHandler(CanaleFault_SelectedIndexChanged);
		this.label16.AutoSize = true;
		this.label16.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label16.Location = new System.Drawing.Point(1568, 9);
		this.label16.Name = "label16";
		this.label16.Size = new System.Drawing.Size(49, 20);
		this.label16.TabIndex = 56;
		this.label16.Text = "Test:";
		this.label17.AutoSize = true;
		this.label17.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label17.Location = new System.Drawing.Point(1727, 9);
		this.label17.Name = "label17";
		this.label17.Size = new System.Drawing.Size(70, 20);
		this.label17.TabIndex = 57;
		this.label17.Text = "Canale:";
		this.label21.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label21.AutoSize = true;
		this.label21.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label21.Location = new System.Drawing.Point(1730, 590);
		this.label21.Name = "label21";
		this.label21.Size = new System.Drawing.Size(116, 20);
		this.label21.TabIndex = 78;
		this.label21.Text = "Temperatura:";
		this.Temperatura.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Temperatura.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Temperatura.Location = new System.Drawing.Point(1852, 590);
		this.Temperatura.Name = "Temperatura";
		this.Temperatura.Size = new System.Drawing.Size(45, 22);
		this.Temperatura.TabIndex = 77;
		this.Temperatura.Text = "70";
		this.Temperatura.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.label22.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label22.AutoSize = true;
		this.label22.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label22.Location = new System.Drawing.Point(1558, 590);
		this.label22.Name = "label22";
		this.label22.Size = new System.Drawing.Size(104, 20);
		this.label22.TabIndex = 80;
		this.label22.Text = "Resistenza:";
		this.Resistenza.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Resistenza.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Resistenza.Location = new System.Drawing.Point(1668, 590);
		this.Resistenza.Name = "Resistenza";
		this.Resistenza.Size = new System.Drawing.Size(45, 22);
		this.Resistenza.TabIndex = 79;
		this.Resistenza.Text = "200";
		this.Resistenza.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.Valvole1.Controls.Add(this.Test1V16);
		this.Valvole1.Controls.Add(this.Test1V15);
		this.Valvole1.Controls.Add(this.Test1V14);
		this.Valvole1.Controls.Add(this.Test1V13);
		this.Valvole1.Controls.Add(this.Test1V12);
		this.Valvole1.Controls.Add(this.Test1V1);
		this.Valvole1.Controls.Add(this.Test1V2);
		this.Valvole1.Controls.Add(this.Test1V3);
		this.Valvole1.Controls.Add(this.Test1V4);
		this.Valvole1.Controls.Add(this.Test1V5);
		this.Valvole1.Controls.Add(this.Test1V6);
		this.Valvole1.Controls.Add(this.Test1V7);
		this.Valvole1.Controls.Add(this.Test1V8);
		this.Valvole1.Controls.Add(this.Test1V9);
		this.Valvole1.Controls.Add(this.Test1V10);
		this.Valvole1.Controls.Add(this.Test1V11);
		this.Valvole1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Valvole1.Location = new System.Drawing.Point(4, 98);
		this.Valvole1.Name = "Valvole1";
		this.Valvole1.Size = new System.Drawing.Size(712, 55);
		this.Valvole1.TabIndex = 81;
		this.Valvole1.TabStop = false;
		this.Valvole1.Text = "Valvole Test 1";
		this.Test1V16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V16.FormattingEnabled = true;
		this.Test1V16.Location = new System.Drawing.Point(385, 8);
		this.Test1V16.Name = "Test1V16";
		this.Test1V16.Size = new System.Drawing.Size(43, 21);
		this.Test1V16.TabIndex = 16;
		this.Test1V15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V15.FormattingEnabled = true;
		this.Test1V15.Location = new System.Drawing.Point(335, 8);
		this.Test1V15.Name = "Test1V15";
		this.Test1V15.Size = new System.Drawing.Size(43, 21);
		this.Test1V15.TabIndex = 15;
		this.Test1V14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V14.FormattingEnabled = true;
		this.Test1V14.Location = new System.Drawing.Point(285, 8);
		this.Test1V14.Name = "Test1V14";
		this.Test1V14.Size = new System.Drawing.Size(43, 21);
		this.Test1V14.TabIndex = 14;
		this.Test1V13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V13.FormattingEnabled = true;
		this.Test1V13.Location = new System.Drawing.Point(606, 26);
		this.Test1V13.Name = "Test1V13";
		this.Test1V13.Size = new System.Drawing.Size(43, 21);
		this.Test1V13.TabIndex = 13;
		this.Test1V12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V12.FormattingEnabled = true;
		this.Test1V12.Location = new System.Drawing.Point(556, 26);
		this.Test1V12.Name = "Test1V12";
		this.Test1V12.Size = new System.Drawing.Size(43, 21);
		this.Test1V12.TabIndex = 12;
		this.Test1V1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V1.FormattingEnabled = true;
		this.Test1V1.Location = new System.Drawing.Point(6, 26);
		this.Test1V1.Name = "Test1V1";
		this.Test1V1.Size = new System.Drawing.Size(43, 21);
		this.Test1V1.TabIndex = 1;
		this.Test1V2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V2.FormattingEnabled = true;
		this.Test1V2.Location = new System.Drawing.Point(56, 26);
		this.Test1V2.Name = "Test1V2";
		this.Test1V2.Size = new System.Drawing.Size(43, 21);
		this.Test1V2.TabIndex = 2;
		this.Test1V3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V3.FormattingEnabled = true;
		this.Test1V3.Location = new System.Drawing.Point(106, 26);
		this.Test1V3.Name = "Test1V3";
		this.Test1V3.Size = new System.Drawing.Size(43, 21);
		this.Test1V3.TabIndex = 3;
		this.Test1V4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V4.FormattingEnabled = true;
		this.Test1V4.Location = new System.Drawing.Point(156, 26);
		this.Test1V4.Name = "Test1V4";
		this.Test1V4.Size = new System.Drawing.Size(43, 21);
		this.Test1V4.TabIndex = 4;
		this.Test1V5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V5.FormattingEnabled = true;
		this.Test1V5.Location = new System.Drawing.Point(206, 26);
		this.Test1V5.Name = "Test1V5";
		this.Test1V5.Size = new System.Drawing.Size(43, 21);
		this.Test1V5.TabIndex = 5;
		this.Test1V6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V6.FormattingEnabled = true;
		this.Test1V6.Location = new System.Drawing.Point(256, 26);
		this.Test1V6.Name = "Test1V6";
		this.Test1V6.Size = new System.Drawing.Size(43, 21);
		this.Test1V6.TabIndex = 6;
		this.Test1V7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V7.FormattingEnabled = true;
		this.Test1V7.Location = new System.Drawing.Point(306, 26);
		this.Test1V7.Name = "Test1V7";
		this.Test1V7.Size = new System.Drawing.Size(43, 21);
		this.Test1V7.TabIndex = 7;
		this.Test1V8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V8.FormattingEnabled = true;
		this.Test1V8.Location = new System.Drawing.Point(356, 26);
		this.Test1V8.Name = "Test1V8";
		this.Test1V8.Size = new System.Drawing.Size(43, 21);
		this.Test1V8.TabIndex = 8;
		this.Test1V9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V9.FormattingEnabled = true;
		this.Test1V9.Location = new System.Drawing.Point(406, 26);
		this.Test1V9.Name = "Test1V9";
		this.Test1V9.Size = new System.Drawing.Size(43, 21);
		this.Test1V9.TabIndex = 9;
		this.Test1V10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V10.FormattingEnabled = true;
		this.Test1V10.Location = new System.Drawing.Point(456, 26);
		this.Test1V10.Name = "Test1V10";
		this.Test1V10.Size = new System.Drawing.Size(43, 21);
		this.Test1V10.TabIndex = 10;
		this.Test1V11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Test1V11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Test1V11.FormattingEnabled = true;
		this.Test1V11.Location = new System.Drawing.Point(506, 26);
		this.Test1V11.Name = "Test1V11";
		this.Test1V11.Size = new System.Drawing.Size(43, 21);
		this.Test1V11.TabIndex = 11;
		this.Canale23.AutoSize = true;
		this.Canale23.Checked = true;
		this.Canale23.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale23.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale23.Location = new System.Drawing.Point(6, 122);
		this.Canale23.Name = "Canale23";
		this.Canale23.Size = new System.Drawing.Size(99, 24);
		this.Canale23.TabIndex = 58;
		this.Canale23.Text = "Canale 3";
		this.Canale23.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale22.AutoSize = true;
		this.Canale22.Checked = true;
		this.Canale22.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale22.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale22.Location = new System.Drawing.Point(6, 86);
		this.Canale22.Name = "Canale22";
		this.Canale22.Size = new System.Drawing.Size(99, 24);
		this.Canale22.TabIndex = 58;
		this.Canale22.Text = "Canale 2";
		this.Canale22.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale21.AutoSize = true;
		this.Canale21.Checked = true;
		this.Canale21.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale21.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale21.Location = new System.Drawing.Point(6, 50);
		this.Canale21.Name = "Canale21";
		this.Canale21.Size = new System.Drawing.Size(99, 24);
		this.Canale21.TabIndex = 49;
		this.Canale21.Text = "Canale 1";
		this.Canale21.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Canale24.AutoSize = true;
		this.Canale24.Checked = true;
		this.Canale24.CheckState = System.Windows.Forms.CheckState.Checked;
		this.Canale24.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canale24.Location = new System.Drawing.Point(6, 158);
		this.Canale24.Name = "Canale24";
		this.Canale24.Size = new System.Drawing.Size(99, 24);
		this.Canale24.TabIndex = 59;
		this.Canale24.Text = "Canale 4";
		this.Canale24.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.StopTest2.AutoSize = true;
		this.StopTest2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.StopTest2.Location = new System.Drawing.Point(0, 190);
		this.StopTest2.Name = "StopTest2";
		this.StopTest2.Size = new System.Drawing.Size(106, 24);
		this.StopTest2.TabIndex = 48;
		this.StopTest2.Text = "Stop Test";
		this.StopTest2.CheckedChanged += new System.EventHandler(SelectedIndexChanged);
		this.Test2.Controls.Add(this.label27);
		this.Test2.Controls.Add(this.Pos2);
		this.Test2.Controls.Add(this.Testo2);
		this.Test2.Controls.Add(this.Val24);
		this.Test2.Controls.Add(this.Val23);
		this.Test2.Controls.Add(this.Val22);
		this.Test2.Controls.Add(this.Val21);
		this.Test2.Controls.Add(this.Cmp24);
		this.Test2.Controls.Add(this.Cmp23);
		this.Test2.Controls.Add(this.Cmp22);
		this.Test2.Controls.Add(this.Cmp21);
		this.Test2.Controls.Add(this.StopTest2);
		this.Test2.Controls.Add(this.Canale24);
		this.Test2.Controls.Add(this.Canale21);
		this.Test2.Controls.Add(this.Canale22);
		this.Test2.Controls.Add(this.Canale23);
		this.Test2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Test2.Location = new System.Drawing.Point(12, 798);
		this.Test2.Name = "Test2";
		this.Test2.Size = new System.Drawing.Size(254, 245);
		this.Test2.TabIndex = 59;
		this.Test2.TabStop = false;
		this.Test2.Text = "Test 2";
		this.label27.AutoSize = true;
		this.label27.Location = new System.Drawing.Point(156, 194);
		this.label27.Name = "label27";
		this.label27.Size = new System.Drawing.Size(44, 20);
		this.label27.TabIndex = 70;
		this.label27.Text = "Pos:";
		this.Pos2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Pos2.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Pos2.Items.AddRange(new object[8] { "1", "2", "3", "4", "5", "6", "7", "8" });
		this.Pos2.Location = new System.Drawing.Point(206, 191);
		this.Pos2.Name = "Pos2";
		this.Pos2.Size = new System.Drawing.Size(38, 24);
		this.Pos2.TabIndex = 69;
		this.Pos2.SelectedIndexChanged += new System.EventHandler(Pos_SelectedIndexChanged);
		this.Testo2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Testo2.Location = new System.Drawing.Point(6, 22);
		this.Testo2.Name = "Testo2";
		this.Testo2.Size = new System.Drawing.Size(240, 26);
		this.Testo2.TabIndex = 68;
		this.Testo2.Text = "Valve closure sealing test";
		this.Val24.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val24.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val24.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val24.Location = new System.Drawing.Point(154, 158);
		this.Val24.Name = "Val24";
		this.Val24.Size = new System.Drawing.Size(92, 24);
		this.Val24.TabIndex = 63;
		this.Val24.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val23.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val23.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val23.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val23.Location = new System.Drawing.Point(154, 123);
		this.Val23.Name = "Val23";
		this.Val23.Size = new System.Drawing.Size(92, 24);
		this.Val23.TabIndex = 62;
		this.Val23.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val22.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val22.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val22.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val22.Location = new System.Drawing.Point(154, 86);
		this.Val22.Name = "Val22";
		this.Val22.Size = new System.Drawing.Size(92, 24);
		this.Val22.TabIndex = 61;
		this.Val22.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Val21.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Val21.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Val21.Items.AddRange(new object[4] { "P_Min", "P_Max", "P_Pompa", "+- P_Min" });
		this.Val21.Location = new System.Drawing.Point(154, 50);
		this.Val21.Name = "Val21";
		this.Val21.Size = new System.Drawing.Size(92, 24);
		this.Val21.TabIndex = 60;
		this.Val21.SelectedIndexChanged += new System.EventHandler(Val_SelectedIndexChanged);
		this.Cmp24.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp24.Location = new System.Drawing.Point(114, 158);
		this.Cmp24.Name = "Cmp24";
		this.Cmp24.Size = new System.Drawing.Size(34, 30);
		this.Cmp24.TabIndex = 67;
		this.Cmp24.Text = ">";
		this.Cmp24.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp23.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp23.Location = new System.Drawing.Point(114, 122);
		this.Cmp23.Name = "Cmp23";
		this.Cmp23.Size = new System.Drawing.Size(34, 30);
		this.Cmp23.TabIndex = 66;
		this.Cmp23.Text = ">";
		this.Cmp23.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp22.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp22.Location = new System.Drawing.Point(114, 86);
		this.Cmp22.Name = "Cmp22";
		this.Cmp22.Size = new System.Drawing.Size(34, 30);
		this.Cmp22.TabIndex = 65;
		this.Cmp22.Text = ">";
		this.Cmp22.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.Cmp21.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cmp21.Location = new System.Drawing.Point(114, 50);
		this.Cmp21.Name = "Cmp21";
		this.Cmp21.Size = new System.Drawing.Size(34, 30);
		this.Cmp21.TabIndex = 64;
		this.Cmp21.Text = ">";
		this.Cmp21.TextAlign = System.Drawing.ContentAlignment.TopCenter;
		this.TestValvole.Controls.Add(this.TestvV16);
		this.TestValvole.Controls.Add(this.TestvV15);
		this.TestValvole.Controls.Add(this.TestvV14);
		this.TestValvole.Controls.Add(this.TestvV13);
		this.TestValvole.Controls.Add(this.TestvV12);
		this.TestValvole.Controls.Add(this.TestvV1);
		this.TestValvole.Controls.Add(this.TestvV2);
		this.TestValvole.Controls.Add(this.TestvV3);
		this.TestValvole.Controls.Add(this.TestvV4);
		this.TestValvole.Controls.Add(this.TestvV5);
		this.TestValvole.Controls.Add(this.TestvV6);
		this.TestValvole.Controls.Add(this.TestvV7);
		this.TestValvole.Controls.Add(this.TestvV8);
		this.TestValvole.Controls.Add(this.TestvV9);
		this.TestValvole.Controls.Add(this.TestvV10);
		this.TestValvole.Controls.Add(this.TestvV11);
		this.TestValvole.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.TestValvole.Location = new System.Drawing.Point(4, 30);
		this.TestValvole.Name = "TestValvole";
		this.TestValvole.Size = new System.Drawing.Size(712, 55);
		this.TestValvole.TabIndex = 82;
		this.TestValvole.TabStop = false;
		this.TestValvole.Text = "Test Valvole";
		this.TestvV16.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV16.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV16.FormattingEnabled = true;
		this.TestvV16.Location = new System.Drawing.Point(385, 8);
		this.TestvV16.Name = "TestvV16";
		this.TestvV16.Size = new System.Drawing.Size(43, 21);
		this.TestvV16.TabIndex = 16;
		this.TestvV15.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV15.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV15.FormattingEnabled = true;
		this.TestvV15.Location = new System.Drawing.Point(335, 8);
		this.TestvV15.Name = "TestvV15";
		this.TestvV15.Size = new System.Drawing.Size(43, 21);
		this.TestvV15.TabIndex = 15;
		this.TestvV14.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV14.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV14.FormattingEnabled = true;
		this.TestvV14.Location = new System.Drawing.Point(285, 8);
		this.TestvV14.Name = "TestvV14";
		this.TestvV14.Size = new System.Drawing.Size(43, 21);
		this.TestvV14.TabIndex = 14;
		this.TestvV13.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV13.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV13.FormattingEnabled = true;
		this.TestvV13.Location = new System.Drawing.Point(606, 26);
		this.TestvV13.Name = "TestvV13";
		this.TestvV13.Size = new System.Drawing.Size(43, 21);
		this.TestvV13.TabIndex = 13;
		this.TestvV12.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV12.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV12.FormattingEnabled = true;
		this.TestvV12.Location = new System.Drawing.Point(556, 26);
		this.TestvV12.Name = "TestvV12";
		this.TestvV12.Size = new System.Drawing.Size(43, 21);
		this.TestvV12.TabIndex = 12;
		this.TestvV1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV1.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV1.FormattingEnabled = true;
		this.TestvV1.Location = new System.Drawing.Point(6, 26);
		this.TestvV1.Name = "TestvV1";
		this.TestvV1.Size = new System.Drawing.Size(43, 21);
		this.TestvV1.TabIndex = 1;
		this.TestvV2.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV2.FormattingEnabled = true;
		this.TestvV2.Location = new System.Drawing.Point(56, 26);
		this.TestvV2.Name = "TestvV2";
		this.TestvV2.Size = new System.Drawing.Size(43, 21);
		this.TestvV2.TabIndex = 2;
		this.TestvV3.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV3.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV3.FormattingEnabled = true;
		this.TestvV3.Location = new System.Drawing.Point(106, 26);
		this.TestvV3.Name = "TestvV3";
		this.TestvV3.Size = new System.Drawing.Size(43, 21);
		this.TestvV3.TabIndex = 3;
		this.TestvV4.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV4.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV4.FormattingEnabled = true;
		this.TestvV4.Location = new System.Drawing.Point(156, 26);
		this.TestvV4.Name = "TestvV4";
		this.TestvV4.Size = new System.Drawing.Size(43, 21);
		this.TestvV4.TabIndex = 4;
		this.TestvV5.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV5.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV5.FormattingEnabled = true;
		this.TestvV5.Location = new System.Drawing.Point(206, 26);
		this.TestvV5.Name = "TestvV5";
		this.TestvV5.Size = new System.Drawing.Size(43, 21);
		this.TestvV5.TabIndex = 5;
		this.TestvV6.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV6.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV6.FormattingEnabled = true;
		this.TestvV6.Location = new System.Drawing.Point(256, 26);
		this.TestvV6.Name = "TestvV6";
		this.TestvV6.Size = new System.Drawing.Size(43, 21);
		this.TestvV6.TabIndex = 6;
		this.TestvV7.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV7.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV7.FormattingEnabled = true;
		this.TestvV7.Location = new System.Drawing.Point(306, 26);
		this.TestvV7.Name = "TestvV7";
		this.TestvV7.Size = new System.Drawing.Size(43, 21);
		this.TestvV7.TabIndex = 7;
		this.TestvV8.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV8.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV8.FormattingEnabled = true;
		this.TestvV8.Location = new System.Drawing.Point(356, 26);
		this.TestvV8.Name = "TestvV8";
		this.TestvV8.Size = new System.Drawing.Size(43, 21);
		this.TestvV8.TabIndex = 8;
		this.TestvV9.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV9.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV9.FormattingEnabled = true;
		this.TestvV9.Location = new System.Drawing.Point(406, 26);
		this.TestvV9.Name = "TestvV9";
		this.TestvV9.Size = new System.Drawing.Size(43, 21);
		this.TestvV9.TabIndex = 9;
		this.TestvV10.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV10.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV10.FormattingEnabled = true;
		this.TestvV10.Location = new System.Drawing.Point(456, 26);
		this.TestvV10.Name = "TestvV10";
		this.TestvV10.Size = new System.Drawing.Size(43, 21);
		this.TestvV10.TabIndex = 10;
		this.TestvV11.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TestvV11.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TestvV11.FormattingEnabled = true;
		this.TestvV11.Location = new System.Drawing.Point(506, 26);
		this.TestvV11.Name = "TestvV11";
		this.TestvV11.Size = new System.Drawing.Size(43, 21);
		this.TestvV11.TabIndex = 11;
		this.label31.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label31.AutoSize = true;
		this.label31.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label31.Location = new System.Drawing.Point(1279, 684);
		this.label31.Name = "label31";
		this.label31.Size = new System.Drawing.Size(150, 20);
		this.label31.TabIndex = 86;
		this.label31.Text = "Pressione ritorno:";
		this.PressioneRitorno.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneRitorno.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneRitorno.Location = new System.Drawing.Point(1435, 685);
		this.PressioneRitorno.Name = "PressioneRitorno";
		this.PressioneRitorno.Size = new System.Drawing.Size(45, 22);
		this.PressioneRitorno.TabIndex = 85;
		this.PressioneRitorno.Text = "120";
		this.PressioneRitorno.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.label32.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label32.AutoSize = true;
		this.label32.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label32.Location = new System.Drawing.Point(1054, 684);
		this.label32.Name = "label32";
		this.label32.Size = new System.Drawing.Size(146, 20);
		this.label32.TabIndex = 84;
		this.label32.Text = "Pressione bassa:";
		this.PressioneBassa.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.PressioneBassa.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.PressioneBassa.Location = new System.Drawing.Point(1206, 684);
		this.PressioneBassa.Name = "PressioneBassa";
		this.PressioneBassa.Size = new System.Drawing.Size(45, 22);
		this.PressioneBassa.TabIndex = 83;
		this.PressioneBassa.Text = "200";
		this.PressioneBassa.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		this.label33.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label33.AutoSize = true;
		this.label33.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label33.Location = new System.Drawing.Point(1511, 684);
		this.label33.Name = "label33";
		this.label33.Size = new System.Drawing.Size(205, 20);
		this.label33.TabIndex = 88;
		this.label33.Text = "Numero ripetizione ciclo:";
		this.RipetizioneCiclo.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.RipetizioneCiclo.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.RipetizioneCiclo.Location = new System.Drawing.Point(1722, 685);
		this.RipetizioneCiclo.Name = "RipetizioneCiclo";
		this.RipetizioneCiclo.Size = new System.Drawing.Size(45, 22);
		this.RipetizioneCiclo.TabIndex = 87;
		this.RipetizioneCiclo.Text = "120";
		this.RipetizioneCiclo.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1900, 1042);
		base.Controls.Add(this.label33);
		base.Controls.Add(this.RipetizioneCiclo);
		base.Controls.Add(this.label31);
		base.Controls.Add(this.PressioneRitorno);
		base.Controls.Add(this.label32);
		base.Controls.Add(this.PressioneBassa);
		base.Controls.Add(this.TestValvole);
		base.Controls.Add(this.Valvole1);
		base.Controls.Add(this.label22);
		base.Controls.Add(this.Resistenza);
		base.Controls.Add(this.label21);
		base.Controls.Add(this.Temperatura);
		base.Controls.Add(this.label17);
		base.Controls.Add(this.label20);
		base.Controls.Add(this.label16);
		base.Controls.Add(this.CanaleFault);
		base.Controls.Add(this.PressioneInizializzazione);
		base.Controls.Add(this.TestFault);
		base.Controls.Add(this.Test8);
		base.Controls.Add(this.Test7);
		base.Controls.Add(this.Valvole8);
		base.Controls.Add(this.Valvole7);
		base.Controls.Add(this.Valvole6);
		base.Controls.Add(this.Test6);
		base.Controls.Add(this.UpDateName);
		base.Controls.Add(this.label14);
		base.Controls.Add(this.CodiceABS);
		base.Controls.Add(this.txtSubCode);
		base.Controls.Add(this.label19);
		base.Controls.Add(this.label18);
		base.Controls.Add(this.PressioneLavoro);
		base.Controls.Add(this.Test2);
		base.Controls.Add(this.Test1);
		base.Controls.Add(this.Elimina);
		base.Controls.Add(this.Duplica);
		base.Controls.Add(this.Clear);
		base.Controls.Add(this.btnTerminal);
		base.Controls.Add(this.label12);
		base.Controls.Add(this.CorrenteMin);
		base.Controls.Add(this.label13);
		base.Controls.Add(this.CorrenteMax);
		base.Controls.Add(this.label11);
		base.Controls.Add(this.AllarmeInf);
		base.Controls.Add(this.Test3);
		base.Controls.Add(this.label6);
		base.Controls.Add(this.PressioneMin);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.Nome);
		base.Controls.Add(this.Invia);
		base.Controls.Add(this.Chiudi);
		base.Controls.Add(this.Salva);
		base.Controls.Add(this.Test5);
		base.Controls.Add(this.Test4);
		base.Controls.Add(this.label3);
		base.Controls.Add(this.Pulse5);
		base.Controls.Add(this.label4);
		base.Controls.Add(this.Pulse4);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.AllarmeSup);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.List);
		base.Controls.Add(this.Valvole5);
		base.Controls.Add(this.Valvole4);
		base.Controls.Add(this.Valvole3);
		base.Controls.Add(this.Valvole2);
		base.Controls.Add(this.PressioneMax);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormHydraulicData";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Hydraulic Data 17/11/2024";
		base.FormClosing += new System.Windows.Forms.FormClosingEventHandler(FormHydraulicData_FormClosing);
		base.FormClosed += new System.Windows.Forms.FormClosedEventHandler(FormHydraulicData_FormClosed);
		base.Load += new System.EventHandler(FormHydraulicData_Load);
		this.Valvole2.ResumeLayout(false);
		this.Valvole3.ResumeLayout(false);
		this.Valvole4.ResumeLayout(false);
		this.Valvole5.ResumeLayout(false);
		((System.ComponentModel.ISupportInitialize)this.List).EndInit();
		this.Test4.ResumeLayout(false);
		this.Test4.PerformLayout();
		this.Test5.ResumeLayout(false);
		this.Test5.PerformLayout();
		this.Test3.ResumeLayout(false);
		this.Test3.PerformLayout();
		this.Test1.ResumeLayout(false);
		this.Test1.PerformLayout();
		this.Test6.ResumeLayout(false);
		this.Test6.PerformLayout();
		this.Valvole6.ResumeLayout(false);
		this.Valvole7.ResumeLayout(false);
		this.Valvole8.ResumeLayout(false);
		this.Test8.ResumeLayout(false);
		this.Test8.PerformLayout();
		this.Test7.ResumeLayout(false);
		this.Test7.PerformLayout();
		this.Valvole1.ResumeLayout(false);
		this.Test2.ResumeLayout(false);
		this.Test2.PerformLayout();
		this.TestValvole.ResumeLayout(false);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
