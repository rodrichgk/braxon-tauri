using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace stk500;

public class FormFirmWare : Form
{
	private string CurrentVersion;

	public string FirmWare;

	private List<string> tList;

	private bool IsBEEFIX = false;

	private IContainer components = null;

	private new Button Select;

	private ListBox Boards;

	public FormFirmWare(List<string> tList, string CurrentVersion)
	{
		InitializeComponent();
		if (Application.ExecutablePath.IndexOf("BEEFIX.exe") > -1)
		{
			IsBEEFIX = true;
		}
		this.tList = tList;
		this.CurrentVersion = CurrentVersion.ToLower() + ".hex";
	}

	private void Boards_Load(object sender, EventArgs e)
	{
		int num = 0;
		if (!IsBEEFIX)
		{
			foreach (string t in tList)
			{
				base.Controls.Add(AdBoard(t, num++));
			}
			Select.Top = 34 + num * 20;
			base.Height = num * 20 + 100;
			return;
		}
		Select.Visible = false;
		Boards.Visible = true;
		base.Width *= 2;
		num = 0;
		int num2 = -1;
		foreach (string t2 in tList)
		{
			string text;
			if (CurrentVersion == t2)
			{
				text = " [Hardware version]";
				num2 = num;
			}
			else
			{
				text = "";
			}
			Boards.Items.Add(t2 + text);
			num++;
		}
		Boards.SelectedIndex = num2;
		if (num2 == -1)
		{
			num2 = 0;
		}
		base.Left = (SystemInformation.VirtualScreen.Width - Boards.Width) / 2;
	}

	private RadioButton AdBoard(string comm, int y)
	{
		RadioButton radioButton = new RadioButton();
		radioButton.AutoSize = true;
		radioButton.Location = new Point(12, 17 + y * 20);
		radioButton.Name = comm;
		radioButton.Size = new Size(85, 17);
		radioButton.Checked = false;
		radioButton.TabStop = true;
		radioButton.TabIndex = y + 1;
		radioButton.Text = comm;
		radioButton.UseVisualStyleBackColor = true;
		radioButton.CheckedChanged += BoardSelected_CheckedChanged;
		if (CurrentVersion == radioButton.Text)
		{
			radioButton.Text += " (Current version)";
			radioButton.Checked = true;
		}
		return radioButton;
	}

	private void Select_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.OK;
	}

	private void Cancel_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.Cancel;
	}

	private void BoardSelected_CheckedChanged(object sender, EventArgs e)
	{
		if (!IsBEEFIX)
		{
			RadioButton radioButton = (RadioButton)sender;
			Select.Enabled = true;
			FirmWare = radioButton.Name;
		}
		else
		{
			FirmWare = Boards.Text.Replace(" [Hardware version]", "");
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
		this.Select = new System.Windows.Forms.Button();
		this.Boards = new System.Windows.Forms.ListBox();
		base.SuspendLayout();
		this.Select.Enabled = false;
		this.Select.Location = new System.Drawing.Point(89, 197);
		this.Select.Name = "Select";
		this.Select.Size = new System.Drawing.Size(75, 23);
		this.Select.TabIndex = 0;
		this.Select.Text = "Select";
		this.Select.UseVisualStyleBackColor = true;
		this.Select.Click += new System.EventHandler(Select_Click);
		this.Boards.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
		this.Boards.Font = new System.Drawing.Font("Microsoft Sans Serif", 18f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Boards.ForeColor = System.Drawing.Color.DarkOrange;
		this.Boards.FormattingEnabled = true;
		this.Boards.ItemHeight = 29;
		this.Boards.Location = new System.Drawing.Point(3, 1);
		this.Boards.Name = "Boards";
		this.Boards.Size = new System.Drawing.Size(247, 149);
		this.Boards.TabIndex = 2;
		this.Boards.Visible = false;
		this.Boards.SelectedIndexChanged += new System.EventHandler(BoardSelected_CheckedChanged);
		this.Boards.DoubleClick += new System.EventHandler(Select_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(252, 148);
		base.ControlBox = false;
		base.Controls.Add(this.Boards);
		base.Controls.Add(this.Select);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormFirmWare";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select FirmWare";
		base.TopMost = true;
		base.Load += new System.EventHandler(Boards_Load);
		base.ResumeLayout(false);
	}
}
