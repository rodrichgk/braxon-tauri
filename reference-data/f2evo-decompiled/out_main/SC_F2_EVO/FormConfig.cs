using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class FormConfig : Form
{
	private string SSID = "SSID";

	private string PWD = "PWD";

	private string IP;

	private const string GRMtronicsIP = "www.testbenches.eu";

	private const string GRMtronicsURL = "/TestABS/TestABS.asmx";

	private const string GRMtronicsPort = "80";

	private const string GRMtronicsFTP = "ftp://ftp.testbenches.eu/testbenches.eu/Backup";

	private TextBox[] Fields;

	private IContainer components = null;

	private Label label1;

	private Label label3;

	public TextBox URLServer;

	public TextBox Port;

	public TextBox IPServer;

	private Label label4;

	private Label label5;

	public TextBox UserName;

	private RadioButton GRMtronics;

	private RadioButton Private;

	public TextBox FTPServer;

	private Label label6;

	private Label label7;

	public TextBox License;

	private Button Cancel;

	private Button Save;

	public FormConfig()
	{
		InitializeComponent();
		Image image = Image.FromFile("Setup.jpg");
		Bitmap bitmap = (Bitmap)image.GetThumbnailImage(64, 64, null, IntPtr.Zero);
		bitmap.MakeTransparent();
		base.Icon = Icon.FromHandle(bitmap.GetHicon());
		Fields = new TextBox[6] { UserName, IPServer, URLServer, Port, FTPServer, License };
		try
		{
			if (File.Exists("Config.txt"))
			{
				string[] array = File.ReadAllLines("Config.txt");
				try
				{
					for (byte b = 0; b < Fields.Length; b++)
					{
						Fields[b].Text = array[b];
					}
				}
				catch
				{
				}
				IPServer.Tag = IPServer.Text;
				URLServer.Tag = URLServer.Text;
				Port.Tag = Port.Text;
				FTPServer.Tag = FTPServer.Text;
			}
			else
			{
				UserName.Text = "";
				IPServer.Text = "www.testbenches.eu";
				URLServer.Text = "/TestABS/TestABS.asmx";
				Port.Text = "80";
				FTPServer.Text = "ftp://ftp.testbenches.eu/testbenches.eu/Backup/" + UserName.Text;
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	public void Save_Click(object sender, EventArgs e)
	{
		try
		{
			File.WriteAllLines("Config.txt", new string[6]
			{
				UserName.Text.Trim(),
				IPServer.Text.Trim(),
				URLServer.Text.Trim(),
				Port.Text.Trim(),
				FTPServer.Text.Trim(),
				License.Text.Trim()
			});
			Close();
		}
		catch (Exception ex)
		{
			MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void Cancel_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.Cancel;
		Close();
	}

	private void GRMtronics_CheckedChanged(object sender, EventArgs e)
	{
		IPServer.Enabled = !GRMtronics.Checked;
		URLServer.Enabled = !GRMtronics.Checked;
		Port.Enabled = !GRMtronics.Checked;
		FTPServer.Enabled = !GRMtronics.Checked;
		if (GRMtronics.Checked)
		{
			IPServer.Tag = IPServer.Text;
			URLServer.Tag = URLServer.Text;
			Port.Tag = Port.Text;
			FTPServer.Tag = FTPServer.Text;
			IPServer.Text = "www.testbenches.eu";
			URLServer.Text = "/TestABS/TestABS.asmx";
			Port.Text = "80";
			FTPServer.Text = "ftp://ftp.testbenches.eu/testbenches.eu/Backup/" + UserName.Text;
		}
		else
		{
			IPServer.Text = IPServer.Tag.ToString();
			URLServer.Text = URLServer.Tag.ToString();
			Port.Text = Port.Tag.ToString();
			FTPServer.Text = FTPServer.Tag.ToString();
		}
	}

	private void Company_TextChanged(object sender, EventArgs e)
	{
		if (GRMtronics.Checked)
		{
			FTPServer.Text = "ftp://ftp.testbenches.eu/testbenches.eu/Backup/" + UserName.Text;
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
		this.label1 = new System.Windows.Forms.Label();
		this.Save = new System.Windows.Forms.Button();
		this.URLServer = new System.Windows.Forms.TextBox();
		this.Port = new System.Windows.Forms.TextBox();
		this.label3 = new System.Windows.Forms.Label();
		this.IPServer = new System.Windows.Forms.TextBox();
		this.label4 = new System.Windows.Forms.Label();
		this.label5 = new System.Windows.Forms.Label();
		this.UserName = new System.Windows.Forms.TextBox();
		this.GRMtronics = new System.Windows.Forms.RadioButton();
		this.Private = new System.Windows.Forms.RadioButton();
		this.FTPServer = new System.Windows.Forms.TextBox();
		this.label6 = new System.Windows.Forms.Label();
		this.label7 = new System.Windows.Forms.Label();
		this.License = new System.Windows.Forms.TextBox();
		this.Cancel = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(0, 218);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(157, 20);
		this.label1.TabIndex = 39;
		this.label1.Text = "URL report server:";
		this.Save.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Save.Location = new System.Drawing.Point(56, 348);
		this.Save.Name = "Save";
		this.Save.Size = new System.Drawing.Size(67, 23);
		this.Save.TabIndex = 10;
		this.Save.Text = "Save";
		this.Save.UseVisualStyleBackColor = true;
		this.Save.Click += new System.EventHandler(Save_Click);
		this.URLServer.Enabled = false;
		this.URLServer.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.URLServer.Location = new System.Drawing.Point(4, 241);
		this.URLServer.Name = "URLServer";
		this.URLServer.Size = new System.Drawing.Size(460, 22);
		this.URLServer.TabIndex = 8;
		this.Port.Enabled = false;
		this.Port.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Port.Location = new System.Drawing.Point(421, 179);
		this.Port.Name = "Port";
		this.Port.Size = new System.Drawing.Size(43, 22);
		this.Port.TabIndex = 7;
		this.Port.Text = "80";
		this.Port.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(418, 156);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(47, 20);
		this.label3.TabIndex = 47;
		this.label3.Text = "Port:";
		this.IPServer.Enabled = false;
		this.IPServer.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.IPServer.Location = new System.Drawing.Point(4, 179);
		this.IPServer.Name = "IPServer";
		this.IPServer.Size = new System.Drawing.Size(393, 22);
		this.IPServer.TabIndex = 6;
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(1, 156);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(172, 20);
		this.label4.TabIndex = 49;
		this.label4.Text = "IP or Domine server:";
		this.label5.AutoSize = true;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.Location = new System.Drawing.Point(2, 60);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(103, 20);
		this.label5.TabIndex = 52;
		this.label5.Text = "User Name:";
		this.UserName.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.UserName.Location = new System.Drawing.Point(6, 81);
		this.UserName.Name = "UserName";
		this.UserName.Size = new System.Drawing.Size(198, 22);
		this.UserName.TabIndex = 2;
		this.UserName.TextChanged += new System.EventHandler(Company_TextChanged);
		this.GRMtronics.AutoSize = true;
		this.GRMtronics.Checked = true;
		this.GRMtronics.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.GRMtronics.Location = new System.Drawing.Point(74, 12);
		this.GRMtronics.Name = "GRMtronics";
		this.GRMtronics.Size = new System.Drawing.Size(155, 20);
		this.GRMtronics.TabIndex = 0;
		this.GRMtronics.TabStop = true;
		this.GRMtronics.Text = "GRMtronics Server";
		this.GRMtronics.UseVisualStyleBackColor = true;
		this.GRMtronics.CheckedChanged += new System.EventHandler(GRMtronics_CheckedChanged);
		this.Private.AutoSize = true;
		this.Private.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Private.Location = new System.Drawing.Point(279, 12);
		this.Private.Name = "Private";
		this.Private.Size = new System.Drawing.Size(124, 20);
		this.Private.TabIndex = 1;
		this.Private.Text = "Private Server";
		this.Private.UseVisualStyleBackColor = true;
		this.FTPServer.Enabled = false;
		this.FTPServer.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.FTPServer.Location = new System.Drawing.Point(5, 303);
		this.FTPServer.Name = "FTPServer";
		this.FTPServer.Size = new System.Drawing.Size(460, 22);
		this.FTPServer.TabIndex = 9;
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(1, 280);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(163, 20);
		this.label6.TabIndex = 56;
		this.label6.Text = "FTP server backup:";
		this.label7.AutoSize = true;
		this.label7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold);
		this.label7.Location = new System.Drawing.Point(2, 106);
		this.label7.Name = "label7";
		this.label7.Size = new System.Drawing.Size(76, 20);
		this.label7.TabIndex = 58;
		this.label7.Text = "License:";
		this.License.Font = new System.Drawing.Font("Microsoft Sans Serif", 8.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.License.Location = new System.Drawing.Point(5, 126);
		this.License.Margin = new System.Windows.Forms.Padding(4);
		this.License.Name = "License";
		this.License.Size = new System.Drawing.Size(460, 20);
		this.License.TabIndex = 4;
		this.Cancel.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Cancel.Location = new System.Drawing.Point(321, 348);
		this.Cancel.Name = "Cancel";
		this.Cancel.Size = new System.Drawing.Size(67, 23);
		this.Cancel.TabIndex = 59;
		this.Cancel.Text = "Cancel";
		this.Cancel.UseVisualStyleBackColor = true;
		this.Cancel.Click += new System.EventHandler(Cancel_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(471, 375);
		base.Controls.Add(this.Cancel);
		base.Controls.Add(this.label7);
		base.Controls.Add(this.License);
		base.Controls.Add(this.FTPServer);
		base.Controls.Add(this.label6);
		base.Controls.Add(this.Private);
		base.Controls.Add(this.GRMtronics);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.UserName);
		base.Controls.Add(this.label4);
		base.Controls.Add(this.IPServer);
		base.Controls.Add(this.label3);
		base.Controls.Add(this.Port);
		base.Controls.Add(this.URLServer);
		base.Controls.Add(this.Save);
		base.Controls.Add(this.label1);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormConfig";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Configuration";
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
