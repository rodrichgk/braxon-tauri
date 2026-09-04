using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class SelectTestForm : Form
{
	public sbyte TestFailed = -1;

	public sbyte ChannelFailed = -1;

	private Dictionary<sbyte, List<sbyte>> ResultTestABS;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private IContainer components = null;

	private ListBox Test;

	private Label label1;

	private Label label2;

	private ListBox Channel;

	public SelectTestForm(int codeABS, int subCode)
	{
		InitializeComponent();
		DataTable dataTable = new DataTable();
		DataTable dataTable2 = new DataTable();
		ResultTestABS = new Dictionary<sbyte, List<sbyte>>();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		int num = 0;
		Command.CommandText = "SELECT ID FROM ABS WHERE CodiceABS =" + codeABS + " AND SubCode = " + subCode;
		Command.Connection.Open();
		num = (int)Command.ExecuteScalar();
		Command.Connection.Close();
		Adapter.SelectCommand.CommandText = "SELECT DISTINCT Test FROM Cicli WHERE ID_ABS = " + num + " AND Test > 0 ORDER BY Test";
		Adapter.Fill(dataTable);
		foreach (DataRow row in dataTable.Rows)
		{
			sbyte key = (sbyte)(byte)row["Test"];
			List<sbyte> list = new List<sbyte>();
			dataTable2.Clear();
			Adapter.SelectCommand.CommandText = "SELECT DISTINCT Canale FROM Cicli WHERE ID_ABS = " + num + " AND Test = " + key + " ORDER BY Canale";
			Adapter.Fill(dataTable2);
			foreach (DataRow row2 in dataTable2.Rows)
			{
				list.Add((sbyte)(byte)row2["Canale"]);
			}
			ResultTestABS.Add(key, list);
		}
		foreach (sbyte key2 in ResultTestABS.Keys)
		{
			Test.Items.Add(key2);
		}
		Test.SelectedIndex = 0;
	}

	public SelectTestForm(Dictionary<sbyte, List<sbyte>> ResultTestABS)
	{
		InitializeComponent();
		this.ResultTestABS = ResultTestABS;
		foreach (sbyte key in ResultTestABS.Keys)
		{
			Test.Items.Add(key);
		}
		Test.SelectedIndex = 0;
	}

	private void Test_SelectedIndexChanged(object sender, EventArgs e)
	{
		ListBox listBox = new ListBox();
		TestFailed = sbyte.Parse(Test.Text);
		List<sbyte> list = ResultTestABS[TestFailed];
		Channel.Items.Clear();
		foreach (sbyte item in list)
		{
			Channel.Items.Add(item);
		}
	}

	private void SelectTestForm_Load(object sender, EventArgs e)
	{
	}

	private void Channel_DoubleClick(object sender, EventArgs e)
	{
		ChannelFailed = sbyte.Parse(Channel.Text);
		base.DialogResult = DialogResult.OK;
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
		this.Test = new System.Windows.Forms.ListBox();
		this.label1 = new System.Windows.Forms.Label();
		this.label2 = new System.Windows.Forms.Label();
		this.Channel = new System.Windows.Forms.ListBox();
		base.SuspendLayout();
		this.Test.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Test.FormattingEnabled = true;
		this.Test.ItemHeight = 24;
		this.Test.Location = new System.Drawing.Point(16, 36);
		this.Test.Name = "Test";
		this.Test.Size = new System.Drawing.Size(120, 124);
		this.Test.TabIndex = 0;
		this.Test.SelectedIndexChanged += new System.EventHandler(Test_SelectedIndexChanged);
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label1.Location = new System.Drawing.Point(12, 9);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(56, 24);
		this.label1.TabIndex = 1;
		this.label1.Text = "Test:";
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.label2.Location = new System.Drawing.Point(177, 9);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(94, 24);
		this.label2.TabIndex = 3;
		this.label2.Text = "Channel:";
		this.Channel.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Channel.FormattingEnabled = true;
		this.Channel.ItemHeight = 24;
		this.Channel.Location = new System.Drawing.Point(181, 36);
		this.Channel.Name = "Channel";
		this.Channel.Size = new System.Drawing.Size(120, 124);
		this.Channel.TabIndex = 2;
		this.Channel.DoubleClick += new System.EventHandler(Channel_DoubleClick);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(314, 172);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.Channel);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Test);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "SelectTestForm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select Channel";
		base.TopMost = true;
		base.Load += new System.EventHandler(SelectTestForm_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
