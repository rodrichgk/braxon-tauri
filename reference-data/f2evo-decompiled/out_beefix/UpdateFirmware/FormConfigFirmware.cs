using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace UpdateFirmware;

public class FormConfigFirmware : Form
{
	private string Path;

	private IContainer components = null;

	private Button Save;

	private Label label1;

	private Label label3;

	public TextBox License;

	public TextBox UserName;

	public FormConfigFirmware(string path = "Config.txt", byte type = 0)
	{
		InitializeComponent();
		Path = path;
		if (Path != "Config.txt" && !File.Exists(Path))
		{
			Path = "Config.txt";
		}
		if (!File.Exists(Path))
		{
			return;
		}
		string[] array = File.ReadAllLines(Path);
		switch (type)
		{
		case 0:
			if (array.Length >= 2)
			{
				UserName.Text = array[0];
				License.Text = array[1];
			}
			break;
		case 1:
			if (array.Length >= 7)
			{
				UserName.Text = array[0];
				License.Text = array[6];
			}
			break;
		case 2:
			if (array.Length >= 6)
			{
				UserName.Text = array[0];
				License.Text = array[5];
			}
			break;
		}
	}

	private void FormConfig_Load(object sender, EventArgs e)
	{
	}

	private void Save_Click(object sender, EventArgs e)
	{
		File.WriteAllLines(Path, new string[2] { UserName.Text, License.Text });
		Close();
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
		this.UserName = new System.Windows.Forms.TextBox();
		this.Save = new System.Windows.Forms.Button();
		this.label1 = new System.Windows.Forms.Label();
		this.label3 = new System.Windows.Forms.Label();
		this.License = new System.Windows.Forms.TextBox();
		base.SuspendLayout();
		this.UserName.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.UserName.Location = new System.Drawing.Point(8, 40);
		this.UserName.Margin = new System.Windows.Forms.Padding(4);
		this.UserName.Name = "UserName";
		this.UserName.Size = new System.Drawing.Size(174, 22);
		this.UserName.TabIndex = 0;
		this.Save.Anchor = System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left;
		this.Save.Location = new System.Drawing.Point(185, 124);
		this.Save.Name = "Save";
		this.Save.Size = new System.Drawing.Size(75, 23);
		this.Save.TabIndex = 4;
		this.Save.Text = "Save";
		this.Save.UseVisualStyleBackColor = true;
		this.Save.Click += new System.EventHandler(Save_Click);
		this.label1.AutoSize = true;
		this.label1.Location = new System.Drawing.Point(5, 20);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(89, 16);
		this.label1.TabIndex = 2;
		this.label1.Text = "User Name:";
		this.label3.AutoSize = true;
		this.label3.Location = new System.Drawing.Point(5, 66);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(65, 16);
		this.label3.TabIndex = 6;
		this.label3.Text = "License:";
		this.License.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.License.Location = new System.Drawing.Point(8, 86);
		this.License.Margin = new System.Windows.Forms.Padding(4);
		this.License.Name = "License";
		this.License.Size = new System.Drawing.Size(427, 22);
		this.License.TabIndex = 1;
		base.AutoScaleDimensions = new System.Drawing.SizeF(9f, 16f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(444, 150);
		base.Controls.Add(this.label3);
		base.Controls.Add(this.License);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Save);
		base.Controls.Add(this.UserName);
		this.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.Margin = new System.Windows.Forms.Padding(4);
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormConfig";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Config";
		base.TopMost = true;
		base.Load += new System.EventHandler(FormConfig_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
