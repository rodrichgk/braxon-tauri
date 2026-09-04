using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace GRMtronics;

public class PortComm : Form
{
	public string[] COMM;

	private List<string> tList;

	private IContainer components = null;

	private new Button Select;

	public PortComm(List<string> tList)
	{
		InitializeComponent();
		this.tList = tList;
		COMM = new string[2];
	}

	private void Boards_Load(object sender, EventArgs e)
	{
		int num = 0;
		foreach (string t in tList)
		{
			base.Controls.Add(AdBoard(t, num++));
		}
		Select.Top = 34 + num * 20;
		base.Height = num * 20 + 100;
	}

	private CheckBox AdBoard(string comm, int y)
	{
		CheckBox checkBox = new CheckBox();
		checkBox.AutoSize = true;
		checkBox.Location = new Point(12, 17 + y * 20);
		checkBox.Name = comm;
		checkBox.Size = new Size(85, 17);
		checkBox.Checked = false;
		checkBox.TabStop = true;
		checkBox.TabIndex = y + 1;
		checkBox.Text = comm;
		checkBox.Enabled = true;
		checkBox.BackColor = Color.AliceBlue;
		checkBox.UseVisualStyleBackColor = true;
		checkBox.CheckedChanged += BoardSelected_CheckedChanged;
		return checkBox;
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
		Select.Enabled = true;
		int num = 0;
		foreach (Control control in base.Controls)
		{
			if (control is CheckBox && ((CheckBox)control).Checked)
			{
				COMM[num++] = ((CheckBox)control).Name;
				if (num == 2)
				{
					break;
				}
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
		this.Select = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.Select.Enabled = false;
		this.Select.Location = new System.Drawing.Point(89, 197);
		this.Select.Name = "Select";
		this.Select.Size = new System.Drawing.Size(75, 23);
		this.Select.TabIndex = 0;
		this.Select.Text = "Select";
		this.Select.UseVisualStyleBackColor = true;
		this.Select.Click += new System.EventHandler(Select_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(252, 232);
		base.ControlBox = false;
		base.Controls.Add(this.Select);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "PortComm";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select Port Comm";
		base.Load += new System.EventHandler(Boards_Load);
		base.ResumeLayout(false);
	}
}
