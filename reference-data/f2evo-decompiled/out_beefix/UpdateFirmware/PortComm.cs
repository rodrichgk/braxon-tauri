using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace UpdateFirmware;

public class PortComm : Form
{
	public string COMM;

	private List<string> tList;

	private bool IsBEEFIX = false;

	private IContainer components = null;

	private new Button Select;

	private ListBox Boards;

	public PortComm(List<string> tList)
	{
		InitializeComponent();
		if (Application.ExecutablePath.IndexOf("BEEFIX.exe") > -1)
		{
			IsBEEFIX = true;
		}
		this.tList = tList;
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
		}
		else
		{
			Select.Visible = false;
			Boards.Visible = true;
			tList.Remove("NONE");
			ListBox.ObjectCollection items = Boards.Items;
			object[] items2 = tList.ToArray();
			items.AddRange(items2);
		}
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
			COMM = radioButton.Name;
		}
		else
		{
			COMM = Boards.Text;
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
		this.Boards.Font = new System.Drawing.Font("Microsoft Sans Serif", 26.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Boards.ForeColor = System.Drawing.Color.Orange;
		this.Boards.FormattingEnabled = true;
		this.Boards.ItemHeight = 39;
		this.Boards.Location = new System.Drawing.Point(2, 3);
		this.Boards.Name = "Boards";
		this.Boards.Size = new System.Drawing.Size(247, 160);
		this.Boards.TabIndex = 1;
		this.Boards.Visible = false;
		this.Boards.SelectedIndexChanged += new System.EventHandler(BoardSelected_CheckedChanged);
		this.Boards.DoubleClick += new System.EventHandler(Select_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(252, 166);
		base.ControlBox = false;
		base.Controls.Add(this.Boards);
		base.Controls.Add(this.Select);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "PortComm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select Port Comm";
		base.TopMost = true;
		base.Load += new System.EventHandler(Boards_Load);
		base.ResumeLayout(false);
	}
}
