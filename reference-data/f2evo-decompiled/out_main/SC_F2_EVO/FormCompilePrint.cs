using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class FormCompilePrint : Form
{
	private IContainer components = null;

	private Button OK;

	private Button Cancel;

	private Label label2;

	private Label label4;

	private Label label1;

	private Label label17;

	private Label label5;

	private Label label6;

	public TextBox InternalCode;

	public TextBox OEM_ABS;

	public TextBox Operator;

	public ComboBox TypeOfTest;

	public TextBox ISOCode;

	public TextBox TechnicalNotes;

	public CheckBox TestResult;

	private Button Logo;

	public OpenFileDialog OpenFile;

	private Label label3;

	public TextBox HardwareVersion;

	private Label label7;

	public TextBox SoftwareVersion;

	public CheckBox InsertLOGO;

	public FormCompilePrint()
	{
		InitializeComponent();
		TypeOfTest.SelectedIndex = 0;
	}

	private void OK_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.OK;
	}

	private void Cancel_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.Cancel;
	}

	private void FormCompilePrint_Load(object sender, EventArgs e)
	{
	}

	private void Icon_Click(object sender, EventArgs e)
	{
		if (OpenFile.ShowDialog() == DialogResult.OK)
		{
			File.Copy(OpenFile.FileName, "Logo1.jpg", overwrite: true);
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
		this.TestResult = new System.Windows.Forms.CheckBox();
		this.OK = new System.Windows.Forms.Button();
		this.Cancel = new System.Windows.Forms.Button();
		this.label2 = new System.Windows.Forms.Label();
		this.InternalCode = new System.Windows.Forms.TextBox();
		this.label4 = new System.Windows.Forms.Label();
		this.OEM_ABS = new System.Windows.Forms.TextBox();
		this.label1 = new System.Windows.Forms.Label();
		this.Operator = new System.Windows.Forms.TextBox();
		this.label17 = new System.Windows.Forms.Label();
		this.TypeOfTest = new System.Windows.Forms.ComboBox();
		this.label5 = new System.Windows.Forms.Label();
		this.ISOCode = new System.Windows.Forms.TextBox();
		this.TechnicalNotes = new System.Windows.Forms.TextBox();
		this.label6 = new System.Windows.Forms.Label();
		this.Logo = new System.Windows.Forms.Button();
		this.OpenFile = new System.Windows.Forms.OpenFileDialog();
		this.label3 = new System.Windows.Forms.Label();
		this.HardwareVersion = new System.Windows.Forms.TextBox();
		this.label7 = new System.Windows.Forms.Label();
		this.SoftwareVersion = new System.Windows.Forms.TextBox();
		this.InsertLOGO = new System.Windows.Forms.CheckBox();
		base.SuspendLayout();
		this.TestResult.AutoSize = true;
		this.TestResult.CheckAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.TestResult.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold);
		this.TestResult.Location = new System.Drawing.Point(282, 147);
		this.TestResult.Name = "TestResult";
		this.TestResult.Size = new System.Drawing.Size(92, 24);
		this.TestResult.TabIndex = 5;
		this.TestResult.Text = "Test OK";
		this.TestResult.UseVisualStyleBackColor = true;
		this.OK.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.OK.Location = new System.Drawing.Point(11, 196);
		this.OK.Name = "OK";
		this.OK.Size = new System.Drawing.Size(75, 42);
		this.OK.TabIndex = 7;
		this.OK.Text = "OK";
		this.OK.UseVisualStyleBackColor = true;
		this.OK.Click += new System.EventHandler(OK_Click);
		this.Cancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		this.Cancel.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cancel.Location = new System.Drawing.Point(553, 196);
		this.Cancel.Name = "Cancel";
		this.Cancel.Size = new System.Drawing.Size(75, 42);
		this.Cancel.TabIndex = 8;
		this.Cancel.Text = "Cancel";
		this.Cancel.UseVisualStyleBackColor = true;
		this.Cancel.Click += new System.EventHandler(Cancel_Click);
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(4, 70);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(120, 20);
		this.label2.TabIndex = 43;
		this.label2.Text = "Internal code:";
		this.InternalCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.InternalCode.Location = new System.Drawing.Point(9, 93);
		this.InternalCode.Name = "InternalCode";
		this.InternalCode.Size = new System.Drawing.Size(239, 22);
		this.InternalCode.TabIndex = 1;
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(277, 11);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(159, 20);
		this.label4.TabIndex = 45;
		this.label4.Text = "OEM ABS number:";
		this.OEM_ABS.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.OEM_ABS.Location = new System.Drawing.Point(282, 34);
		this.OEM_ABS.Name = "OEM_ABS";
		this.OEM_ABS.Size = new System.Drawing.Size(346, 22);
		this.OEM_ABS.TabIndex = 3;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(4, 11);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(85, 20);
		this.label1.TabIndex = 47;
		this.label1.Text = "Operator:";
		this.Operator.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Operator.Location = new System.Drawing.Point(9, 34);
		this.Operator.Name = "Operator";
		this.Operator.Size = new System.Drawing.Size(239, 22);
		this.Operator.TabIndex = 0;
		this.label17.AutoSize = true;
		this.label17.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label17.Location = new System.Drawing.Point(7, 125);
		this.label17.Name = "label17";
		this.label17.Size = new System.Drawing.Size(109, 20);
		this.label17.TabIndex = 74;
		this.label17.Text = "Type of test:";
		this.TypeOfTest.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.TypeOfTest.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.TypeOfTest.FormattingEnabled = true;
		this.TypeOfTest.Items.AddRange(new object[3] { "Pre-repair test", "Post-repair test", "Other" });
		this.TypeOfTest.Location = new System.Drawing.Point(12, 148);
		this.TypeOfTest.Name = "TypeOfTest";
		this.TypeOfTest.Size = new System.Drawing.Size(235, 24);
		this.TypeOfTest.TabIndex = 2;
		this.label5.AutoSize = true;
		this.label5.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label5.Location = new System.Drawing.Point(276, 70);
		this.label5.Name = "label5";
		this.label5.Size = new System.Drawing.Size(89, 20);
		this.label5.TabIndex = 76;
		this.label5.Text = "ISO code:";
		this.ISOCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.ISOCode.Location = new System.Drawing.Point(281, 93);
		this.ISOCode.Name = "ISOCode";
		this.ISOCode.Size = new System.Drawing.Size(345, 22);
		this.ISOCode.TabIndex = 4;
		this.TechnicalNotes.AllowDrop = true;
		this.TechnicalNotes.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.TechnicalNotes.Location = new System.Drawing.Point(668, 148);
		this.TechnicalNotes.Multiline = true;
		this.TechnicalNotes.Name = "TechnicalNotes";
		this.TechnicalNotes.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
		this.TechnicalNotes.Size = new System.Drawing.Size(347, 90);
		this.TechnicalNotes.TabIndex = 6;
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(664, 125);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(140, 20);
		this.label6.TabIndex = 88;
		this.label6.Text = "Technical notes:";
		this.Logo.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Logo.Location = new System.Drawing.Point(282, 196);
		this.Logo.Name = "Logo";
		this.Logo.Size = new System.Drawing.Size(75, 42);
		this.Logo.TabIndex = 89;
		this.Logo.Text = "Logo";
		this.Logo.UseVisualStyleBackColor = true;
		this.Logo.Click += new System.EventHandler(Icon_Click);
		this.OpenFile.Filter = "jpg files|*.jpg|png files|*.png|bmp files|*.bmp|all files|*.*";
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(662, 70);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(153, 20);
		this.label3.TabIndex = 93;
		this.label3.Text = "Hardware version:";
		this.HardwareVersion.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.HardwareVersion.Location = new System.Drawing.Point(667, 93);
		this.HardwareVersion.Name = "HardwareVersion";
		this.HardwareVersion.Size = new System.Drawing.Size(345, 22);
		this.HardwareVersion.TabIndex = 91;
		this.label7.AutoSize = true;
		this.label7.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label7.Location = new System.Drawing.Point(663, 11);
		this.label7.Name = "label7";
		this.label7.Size = new System.Drawing.Size(148, 20);
		this.label7.TabIndex = 92;
		this.label7.Text = "Software version:";
		this.SoftwareVersion.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.SoftwareVersion.Location = new System.Drawing.Point(668, 34);
		this.SoftwareVersion.Name = "SoftwareVersion";
		this.SoftwareVersion.Size = new System.Drawing.Size(346, 22);
		this.SoftwareVersion.TabIndex = 90;
		this.InsertLOGO.AutoSize = true;
		this.InsertLOGO.CheckAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.InsertLOGO.Checked = true;
		this.InsertLOGO.CheckState = System.Windows.Forms.CheckState.Checked;
		this.InsertLOGO.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold);
		this.InsertLOGO.Location = new System.Drawing.Point(363, 206);
		this.InsertLOGO.Name = "InsertLOGO";
		this.InsertLOGO.Size = new System.Drawing.Size(130, 24);
		this.InsertLOGO.TabIndex = 95;
		this.InsertLOGO.Text = "Insert LOGO";
		this.InsertLOGO.UseVisualStyleBackColor = true;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(1020, 257);
		base.Controls.Add(this.InsertLOGO);
		base.Controls.Add(this.label3);
		base.Controls.Add(this.HardwareVersion);
		base.Controls.Add(this.label7);
		base.Controls.Add(this.SoftwareVersion);
		base.Controls.Add(this.Logo);
		base.Controls.Add(this.TestResult);
		base.Controls.Add(this.TechnicalNotes);
		base.Controls.Add(this.label6);
		base.Controls.Add(this.label5);
		base.Controls.Add(this.ISOCode);
		base.Controls.Add(this.label17);
		base.Controls.Add(this.TypeOfTest);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Operator);
		base.Controls.Add(this.label4);
		base.Controls.Add(this.OEM_ABS);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.InternalCode);
		base.Controls.Add(this.Cancel);
		base.Controls.Add(this.OK);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormCompilePrint";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Compile Print";
		base.Load += new System.EventHandler(FormCompilePrint_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
