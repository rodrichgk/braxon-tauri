using System;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class SelectABSForm : Form
{
	public byte SubCode = 0;

	public bool IsGruppo = false;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private DataTable ABS;

	private IContainer components = null;

	public SelectABSForm(int code, bool type = true)
	{
		InitializeComponent();
		ABS = new DataTable();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		Connessione.Open();
		Command.CommandText = "SELECT Count(*) AS N FROM ABS WHERE CodiceABS = " + code;
		int num = (int)Command.ExecuteScalar();
		IsGruppo = num > 1;
		if (IsGruppo)
		{
			Adapter.SelectCommand.CommandText = "SELECT SubCode, Nome FROM ABS WHERE CodiceABS= " + code + " ORDER BY Nome";
			Adapter.Fill(ABS);
			RadioButton radioButton = null;
			int num2 = 0;
			int num3 = 10;
			SizeF sizeF = default(SizeF);
			foreach (DataRow row in ABS.Rows)
			{
				radioButton = new RadioButton();
				radioButton.Text = row["Nome"].ToString();
				radioButton.Top = num3;
				radioButton.Left = 5;
				radioButton.Tag = row["SubCode"];
				radioButton.AutoSize = true;
				radioButton.Font = new Font("Microsoft Sans Serif", 12f, FontStyle.Bold | FontStyle.Italic, GraphicsUnit.Point, 0);
				radioButton.CheckedChanged += ABS_CheckedChanged;
				sizeF = CreateGraphics().MeasureString(radioButton.Text, radioButton.Font);
				num3 += (int)(Math.Round(sizeF.Height, 0) * 1.2);
				if ((float)num2 < sizeF.Width)
				{
					num2 = (int)Math.Round(sizeF.Width);
				}
				base.Controls.Add(radioButton);
			}
			num3 += (int)(Math.Round(sizeF.Height, 0) * 3.0);
			base.Height = num3;
			base.Width = num2 + 70;
		}
		else if (num == 1)
		{
			Command.CommandText = "SELECT SubCode FROM ABS WHERE CodiceABS = " + code;
			SubCode = (byte)Command.ExecuteScalar();
		}
		Connessione.Close();
	}

	private void ABS_CheckedChanged(object sender, EventArgs e)
	{
		RadioButton radioButton = sender as RadioButton;
		SubCode = (byte)radioButton.Tag;
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
		base.SuspendLayout();
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(218, 96);
		base.ControlBox = false;
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.Name = "SelectABSForm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select ABS";
		base.ResumeLayout(false);
	}
}
