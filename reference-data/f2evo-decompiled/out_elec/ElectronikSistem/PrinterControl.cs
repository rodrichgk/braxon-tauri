using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ElectronikSistem;

public class PrinterControl : UserControl
{
	private ComponentResourceManager resources = new ComponentResourceManager(typeof(PrinterControl));

	private ToolStripItem PrintReportButton = null;

	private ToolStripButton Logo;

	private ToolStripButton Printer;

	private ToolStripButton Margins;

	private ToolStripComboBox Printers;

	private JavaScriptSerializer Serializer;

	private IContainer components = null;

	private PrintDialog PrintSetup;

	private PrintDocument Document;

	private PrintPreviewDialog Report;

	private PageSetupDialog PageSetup;

	private OpenFileDialog OpenFile;

	public bool IsPreview => Document.PrintController.IsPreview;

	public string PrinterName
	{
		get
		{
			return Document.PrinterSettings.PrinterName;
		}
		set
		{
			Document.PrinterSettings.PrinterName = value;
		}
	}

	public string PrintFileName
	{
		get
		{
			return Document.PrinterSettings.PrintFileName;
		}
		set
		{
			Document.PrinterSettings.PrintFileName = value;
		}
	}

	public bool PrintToFile
	{
		get
		{
			return Document.PrinterSettings.PrintToFile;
		}
		set
		{
			Document.PrinterSettings.PrintToFile = value;
		}
	}

	public event PrintEventHandler BeginPrint;

	public event PrintEventHandler EndPrint;

	public event PrintPageEventHandler PrintPage;

	public PrinterControl()
	{
		InitializeComponent();
		SetReportControl();
	}

	private void Report_Load(object sender, EventArgs e)
	{
		if (this.BeginPrint != null)
		{
			Document.BeginPrint += this.BeginPrint;
		}
		if (this.EndPrint != null)
		{
			Document.EndPrint += this.EndPrint;
		}
		if (this.PrintPage != null)
		{
			Document.PrintPage += this.PrintPage;
		}
		Report.Left = (SystemInformation.WorkingArea.Size.Width - Report.Width) / 2;
	}

	private void SetReportControl()
	{
		PrinterSettings printerSettings = new PrinterSettings();
		string text;
		if (File.Exists("Printer.txt"))
		{
			text = File.ReadAllText("Printer.txt");
			string[] array = new string[PrinterSettings.InstalledPrinters.Count];
			PrinterSettings.InstalledPrinters.CopyTo(array, 0);
			if (!array.Contains(text))
			{
				text = printerSettings.PrinterName;
			}
		}
		else
		{
			text = printerSettings.PrinterName;
		}
		Serializer = new JavaScriptSerializer();
		if (File.Exists(text + ".conf"))
		{
			string input = File.ReadAllText(text + ".conf");
			Margins margins = Serializer.Deserialize<Margins>(input);
			PageSetup.PageSettings.Margins = margins;
		}
		Image image = (Image)resources.GetObject("Logo");
		Image image2 = (Image)resources.GetObject("Setup");
		Image image3 = (Image)resources.GetObject("Margins");
		ToolStrip toolStrip = (ToolStrip)Report.Controls[1];
		Logo = new ToolStripButton("Logo", image, Logo_Click, "Logo");
		Printer = new ToolStripButton("Setup", image2, Setup_Click, "Setup");
		Margins = new ToolStripButton("Margins", image3, Margins_Click, "Margins");
		Printers = new ToolStripComboBox("Printers");
		foreach (string installedPrinter in PrinterSettings.InstalledPrinters)
		{
			Printers.Items.Add(installedPrinter);
		}
		Printers.Sorted = true;
		toolStrip.Items.Insert(1, Printer);
		toolStrip.Items.Insert(2, Margins);
		foreach (Control control in Report.Controls)
		{
			if (!(control is ToolStrip))
			{
				continue;
			}
			control.Height = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.05f);
			toolStrip = (ToolStrip)control;
			foreach (ToolStripItem item in toolStrip.Items)
			{
				item.ImageScaling = ToolStripItemImageScaling.None;
				item.AutoSize = false;
				item.Width = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.05f);
				item.Height = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.04f);
				if (item.Name == "printToolStripButton")
				{
					item.Margin = new Padding(40, 0, 40, 0);
					item.Text = "Print";
					item.Click += delegate
					{
					};
					PrintReportButton = item;
					if (text == "Microsoft Print to PDF")
					{
						PrintReportButton.Image = (Image)resources.GetObject("Floppy Disk");
					}
					else
					{
						PrintReportButton.Image = (Image)resources.GetObject("Printer.jpg");
					}
				}
				if (item.Text == "&Pagina")
				{
					item.Text = "&Page";
				}
				if (item is ToolStripControlHost)
				{
					item.Font = Printers.Font;
				}
				if (item is ToolStripButton || item is ToolStripSplitButton)
				{
					if (item.Name != "closeToolStripButton")
					{
						item.DisplayStyle = ToolStripItemDisplayStyle.None;
						item.Width = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.04f);
					}
					else
					{
						item.Text = "Close";
					}
					Image image4 = item.Image;
					item.BackgroundImage = image4;
					item.BackgroundImageLayout = ImageLayout.Zoom;
					item.Image = null;
					if (item is ToolStripSplitButton)
					{
						item.Width = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.06f);
					}
				}
			}
		}
		toolStrip.Items.Insert(11, Printers);
		PrintSetup.PrinterSettings.PrinterName = text;
		PageSetup.PrinterSettings.PrinterName = text;
		Printers.Text = text;
		Printers.SelectedIndexChanged += Printers_SelectedIndexChanged;
		Printers.AutoSize = false;
		Printers.DropDownStyle = ComboBoxStyle.DropDownList;
		Printers.Width = (int)((float)SystemInformation.WorkingArea.Size.Height * 0.3f);
		ToolStripSeparator toolStripSeparator = new ToolStripSeparator();
		toolStripSeparator.Margin = new Padding(0, 0, 40, 0);
		toolStrip.Items.Insert(12, toolStripSeparator);
		Report.Width = (int)((double)SystemInformation.WorkingArea.Size.Width * 0.75);
		Report.Height = SystemInformation.VirtualScreen.Size.Height;
		Report.Top = 0;
		Document.DefaultPageSettings = PageSetup.PageSettings;
		Document.PrinterSettings = PrintSetup.PrinterSettings;
	}

	private void InitializeReport()
	{
		Document.Dispose();
		Document = null;
		Document = new PrintDocument();
		Document.OriginAtMargins = true;
		Report.Dispose();
		while (!Report.IsDisposed)
		{
			Application.DoEvents();
		}
		Report = null;
		Report = new PrintPreviewDialog();
		Report.AutoScrollMargin = new Size(0, 0);
		Report.AutoScrollMinSize = new Size(0, 0);
		Report.ClientSize = new Size(400, 300);
		Report.Document = Document;
		Report.Enabled = true;
		Report.Icon = (Icon)resources.GetObject("Report.Icon");
		Report.Name = "Report";
		Report.Visible = false;
		Report.Load += Report_Load;
		SetReportControl();
		Report.DialogResult = DialogResult.OK;
	}

	private void Printers_SelectedIndexChanged(object sender, EventArgs e)
	{
		File.WriteAllText("Printer.txt", Printers.Text);
		if (File.Exists(Printers.Text + ".conf"))
		{
			string input = File.ReadAllText(Printers.Text + ".conf");
			Margins margins = Serializer.Deserialize<Margins>(input);
			PageSetup.PageSettings.Margins = margins;
		}
		Report.DialogResult = DialogResult.Retry;
		Report.Close();
	}

	private void Margins_Click(object sender, EventArgs e)
	{
		if (PageSetup.ShowDialog() == DialogResult.OK)
		{
			Document.PrinterSettings = PageSetup.PrinterSettings;
			Document.DefaultPageSettings = PageSetup.PageSettings;
			string contents = Serializer.Serialize(PageSetup.PageSettings.Margins);
			File.WriteAllText(Printers.Text + ".conf", contents);
			PrintPreviewControl printPreviewControl = (PrintPreviewControl)Report.Controls[0];
			printPreviewControl.InvalidatePreview();
		}
		else
		{
			PageSetup.PrinterSettings = Document.PrinterSettings;
			PageSetup.PageSettings = Document.DefaultPageSettings;
		}
	}

	private void Setup_Click(object sender, EventArgs e)
	{
		if (PrintSetup.ShowDialog() == DialogResult.OK)
		{
			Document.Print();
		}
		else
		{
			PrintPreviewControl printPreviewControl = (PrintPreviewControl)Report.Controls[0];
			printPreviewControl.InvalidatePreview();
		}
		Printers.Text = PrintSetup.PrinterSettings.PrinterName;
	}

	private void Logo_Click(object sender, EventArgs e)
	{
		if (OpenFile.ShowDialog() == DialogResult.OK)
		{
			File.Copy(OpenFile.FileName, "Logo.jpg", overwrite: true);
			PrintPreviewControl printPreviewControl = (PrintPreviewControl)Report.Controls[0];
			printPreviewControl.InvalidatePreview();
		}
	}

	public void Print()
	{
		Application.ThreadException += Application_ThreadException;
		while (Report.ShowDialog() == DialogResult.Retry)
		{
			InitializeReport();
		}
		Application.ThreadException -= Application_ThreadException;
	}

	public void Close()
	{
		Report.Close();
	}

	private void Application_ThreadException(object sender, ThreadExceptionEventArgs e)
	{
		MessageBox.Show(new Form
		{
			TopMost = true
		}, "Error: Printer.\r\n\r\n" + e.Exception.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
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
		System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ElectronikSistem.PrinterControl));
		this.PrintSetup = new System.Windows.Forms.PrintDialog();
		this.Document = new System.Drawing.Printing.PrintDocument();
		this.Report = new System.Windows.Forms.PrintPreviewDialog();
		this.PageSetup = new System.Windows.Forms.PageSetupDialog();
		this.OpenFile = new System.Windows.Forms.OpenFileDialog();
		base.SuspendLayout();
		this.PrintSetup.AllowCurrentPage = true;
		this.PrintSetup.AllowSelection = true;
		this.PrintSetup.Document = this.Document;
		this.PrintSetup.UseEXDialog = true;
		this.Document.OriginAtMargins = true;
		this.Report.AutoScrollMargin = new System.Drawing.Size(0, 0);
		this.Report.AutoScrollMinSize = new System.Drawing.Size(0, 0);
		this.Report.ClientSize = new System.Drawing.Size(400, 300);
		this.Report.Document = this.Document;
		this.Report.Enabled = true;
		this.Report.Icon = (System.Drawing.Icon)resources.GetObject("Report.Icon");
		this.Report.Name = "Report";
		this.Report.Visible = false;
		this.Report.Load += new System.EventHandler(Report_Load);
		this.PageSetup.Document = this.Document;
		this.PageSetup.EnableMetric = true;
		this.OpenFile.Filter = "jpg files|*.jpg|png files|*.png|bmp files|*.bmp|all files|*.*";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.Name = "PrinterControl";
		base.Size = new System.Drawing.Size(230, 185);
		base.ResumeLayout(false);
	}
}
