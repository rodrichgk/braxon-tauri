using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace ElectronikSistem;

public class FormReport : Form
{
	public PrinterControl Printer;

	private IContainer components = null;

	public RichTextBox Report;

	public Button Print;

	public FormReport(bool enableprinter = false)
	{
		InitializeComponent();
		Print.Enabled = enableprinter;
	}

	public FormReport()
	{
		InitializeComponent();
		Print.Enabled = true;
	}

	private void Print_Click(object sender, EventArgs e)
	{
		if (Printer != null)
		{
			base.TopMost = false;
			Printer.Print();
			base.TopMost = true;
		}
	}

	private void FormReport_Load(object sender, EventArgs e)
	{
		Report.Font = new Font(FontFamily.GenericMonospace, 12.75f, FontStyle.Bold);
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
		this.Report = new System.Windows.Forms.RichTextBox();
		this.Print = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.Report.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Report.Location = new System.Drawing.Point(1, 2);
		this.Report.Name = "Report";
		this.Report.ScrollBars = System.Windows.Forms.RichTextBoxScrollBars.Vertical;
		this.Report.Size = new System.Drawing.Size(1007, 698);
		this.Report.TabIndex = 0;
		this.Report.Text = "";
		this.Print.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Print.Location = new System.Drawing.Point(497, 5);
		this.Print.Name = "Print";
		this.Print.Size = new System.Drawing.Size(75, 23);
		this.Print.TabIndex = 1;
		this.Print.Text = "Print";
		this.Print.UseVisualStyleBackColor = true;
		this.Print.Click += new System.EventHandler(Print_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1009, 699);
		base.Controls.Add(this.Print);
		base.Controls.Add(this.Report);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormReport";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "FormReport";
		base.Load += new System.EventHandler(FormReport_Load);
		base.ResumeLayout(false);
	}
}
