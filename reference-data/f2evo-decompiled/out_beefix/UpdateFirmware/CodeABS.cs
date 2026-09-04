using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Windows.Forms;
using ElectronikSistem;

namespace UpdateFirmware;

public class CodeABS : Form
{
	private IContainer components = null;

	private ComboBox NamesABS;

	private Label label1;

	private Button button1;

	private TextBox Code;

	private Label label2;

	public CodeABS()
	{
		InitializeComponent();
	}

	private void CodeABS_Load(object sender, EventArgs e)
	{
		SortedList<string, string> sortedList = new SortedList<string, string>();
		DataTable dataTable = new DataTable();
		dataTable.Columns.Add("ID", typeof(int));
		dataTable.Columns.Add("Name", typeof(string));
		MemoryStream memoryStream = FTP.Download(MainForm.Domain + "Firmware/Codes ABS.txt", MainForm.Login, MainForm.Password);
		StreamReader streamReader = new StreamReader(memoryStream);
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			string text = streamReader.ReadLine();
			sortedList.Add(text, text);
		}
		streamReader.Close();
		memoryStream.Close();
		foreach (string value in sortedList.Values)
		{
			int num = Convert.ToInt32(value.Split('=')[1].Trim());
			string text = value.Split('=')[0].Trim();
			dataTable.Rows.Add(num, text);
		}
		NamesABS.DataSource = dataTable;
		NamesABS.DisplayMember = "Name";
		NamesABS.ValueMember = "ID";
		NamesABS.SelectedIndex = -1;
	}

	private void Save_Click(object sender, EventArgs e)
	{
		int num = 0;
		string text = "";
		if (NamesABS.SelectedIndex == -1)
		{
			if (!ushort.TryParse(Code.Text, out var result))
			{
				MessageBox.Show("Codice input errato.", "Information:", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
				return;
			}
			text = result.ToString().Trim().PadLeft(4, '0');
		}
		else
		{
			text = NamesABS.SelectedValue.ToString().PadLeft(4, '0');
		}
		string text2 = "";
		string text3 = "40404040";
		MemoryStream memoryStream = FTP.Download(MainForm.Domain + "Firmware/Decoder.hex", MainForm.Login, MainForm.Password);
		StreamReader streamReader = new StreamReader(memoryStream);
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			streamReader.ReadLine();
			num++;
		}
		string[] array = new string[num];
		num = 0;
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			array[num] = streamReader.ReadLine();
			num++;
		}
		streamReader.Close();
		memoryStream.Close();
		string text4 = text;
		foreach (char c in text4)
		{
			text2 += ((byte)c).ToString("X");
		}
		for (int j = 0; j < array.Length; j++)
		{
			num = array[j].IndexOf(text3);
			if (num > -1 && num % 2 == 1)
			{
				array[j] = array[j].Replace(text3, text2);
				byte b = CheckSum(array[j]);
				array[j] = array[j].Substring(0, array[j].Length - 2) + b.ToString("X");
			}
		}
		if (File.Exists("CodeABS.hex"))
		{
			File.Delete("CodeABS.hex");
		}
		File.WriteAllLines("CodeABS.hex", array);
		MessageBox.Show("Firmware generated.", "Information:", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
		Close();
	}

	private byte CheckSum(string row)
	{
		int num = 0;
		for (byte b = 1; b < row.Length - 2; b += 2)
		{
			num += byte.Parse(row.Substring(b, 2), NumberStyles.HexNumber);
		}
		num ^= 0xFFFF;
		num++;
		return (byte)(num & 0xFF);
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
		this.NamesABS = new System.Windows.Forms.ComboBox();
		this.label1 = new System.Windows.Forms.Label();
		this.button1 = new System.Windows.Forms.Button();
		this.Code = new System.Windows.Forms.TextBox();
		this.label2 = new System.Windows.Forms.Label();
		base.SuspendLayout();
		this.NamesABS.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.NamesABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.NamesABS.FormattingEnabled = true;
		this.NamesABS.Location = new System.Drawing.Point(12, 38);
		this.NamesABS.Name = "NamesABS";
		this.NamesABS.Size = new System.Drawing.Size(203, 23);
		this.NamesABS.TabIndex = 0;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(8, 15);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(101, 20);
		this.label1.TabIndex = 1;
		this.label1.Text = "Select ABS";
		this.button1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.button1.Location = new System.Drawing.Point(76, 100);
		this.button1.Name = "button1";
		this.button1.Size = new System.Drawing.Size(75, 31);
		this.button1.TabIndex = 2;
		this.button1.Text = "Save";
		this.button1.UseVisualStyleBackColor = true;
		this.button1.Click += new System.EventHandler(Save_Click);
		this.Code.Font = new System.Drawing.Font("Microsoft Sans Serif", 9f, System.Drawing.FontStyle.Bold);
		this.Code.Location = new System.Drawing.Point(151, 67);
		this.Code.Name = "Code";
		this.Code.Size = new System.Drawing.Size(64, 21);
		this.Code.TabIndex = 3;
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(8, 68);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(103, 20);
		this.label2.TabIndex = 4;
		this.label2.Text = "Input Code:";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(227, 143);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.Code);
		base.Controls.Add(this.button1);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.NamesABS);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "CodeABS";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Code ABS";
		base.TopMost = true;
		base.Load += new System.EventHandler(CodeABS_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
