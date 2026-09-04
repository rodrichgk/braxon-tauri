using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace UpdateFirmware;

public class WhiteForm : Form
{
	public string COMM;

	private List<string> tList;

	private IContainer components = null;

	private Timer Bilink;

	public Label Message;

	public WhiteForm()
	{
		InitializeComponent();
	}

	private void Blink_Tick(object sender, EventArgs e)
	{
		Label message = Message;
		message.Visible = !message.Visible;
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
		this.Message = new System.Windows.Forms.Label();
		this.Bilink = new System.Windows.Forms.Timer(this.components);
		base.SuspendLayout();
		this.Message.AutoSize = true;
		this.Message.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Message.Location = new System.Drawing.Point(130, 48);
		this.Message.Name = "Message";
		this.Message.Size = new System.Drawing.Size(107, 31);
		this.Message.TabIndex = 0;
		this.Message.Text = "Wait !!!";
		this.Bilink.Enabled = true;
		this.Bilink.Interval = 500;
		this.Bilink.Tick += new System.EventHandler(Blink_Tick);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(399, 126);
		base.ControlBox = false;
		base.Controls.Add(this.Message);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "WhiteForm";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Request board";
		base.TopMost = true;
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
