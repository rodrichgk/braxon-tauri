using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class WhiteForm : Form
{
	public string COMM;

	private List<string> tList;

	private IContainer components = null;

	private Label label1;

	private Timer Bilink;

	public WhiteForm()
	{
		InitializeComponent();
	}

	private void Blink_Tick(object sender, EventArgs e)
	{
		Label label = label1;
		label.Visible = !label.Visible;
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
		this.label1 = new System.Windows.Forms.Label();
		this.Bilink = new System.Windows.Forms.Timer(this.components);
		base.SuspendLayout();
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 20.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(130, 48);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(107, 31);
		this.label1.TabIndex = 0;
		this.label1.Text = "Wait !!!";
		this.Bilink.Enabled = true;
		this.Bilink.Interval = 500;
		this.Bilink.Tick += new System.EventHandler(Blink_Tick);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(399, 126);
		base.ControlBox = false;
		base.Controls.Add(this.label1);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "WhiteForm";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Request board";
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
