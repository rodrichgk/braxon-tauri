using System;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace UpdateFirmware;

public class Boards : Form
{
	public string Model;

	private MemoryStream Boardfile;

	private IContainer components = null;

	private new Button Select;

	private Button Cancel;

	public Boards(MemoryStream Boardfile)
	{
		InitializeComponent();
		this.Boardfile = Boardfile;
	}

	private void Boards_Load(object sender, EventArgs e)
	{
		int num = 0;
		StreamReader streamReader = new StreamReader(Boardfile);
		streamReader.BaseStream.Position = 0L;
		while (!streamReader.EndOfStream)
		{
			string text = streamReader.ReadLine();
			if (!(text == ""))
			{
				base.Controls.Add(AdBoard(text, num++));
			}
		}
		Select.Top = 34 + num * 20;
		Cancel.Top = 34 + num * 20;
		base.Height = num * 20 + 100;
		Application.DoEvents();
	}

	private RadioButton AdBoard(string model, int y)
	{
		RadioButton radioButton = new RadioButton();
		radioButton.AutoSize = true;
		radioButton.Location = new Point(12, 17 + y * 20);
		radioButton.Name = model.Split(";"[0])[0];
		radioButton.Size = new Size(85, 17);
		radioButton.Checked = false;
		radioButton.TabStop = true;
		radioButton.Text = model.Split(";"[0])[2];
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
		RadioButton radioButton = (RadioButton)sender;
		Select.Enabled = true;
		Model = radioButton.Name;
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
		this.Cancel = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.Select.Enabled = false;
		this.Select.Location = new System.Drawing.Point(28, 197);
		this.Select.Name = "Select";
		this.Select.Size = new System.Drawing.Size(75, 23);
		this.Select.TabIndex = 0;
		this.Select.Text = "Select";
		this.Select.UseVisualStyleBackColor = true;
		this.Select.Click += new System.EventHandler(Select_Click);
		this.Cancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		this.Cancel.Location = new System.Drawing.Point(150, 197);
		this.Cancel.Name = "Cancel";
		this.Cancel.Size = new System.Drawing.Size(75, 23);
		this.Cancel.TabIndex = 1;
		this.Cancel.Text = "Cancel";
		this.Cancel.UseVisualStyleBackColor = true;
		this.Cancel.Click += new System.EventHandler(Cancel_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.CancelButton = this.Cancel;
		base.ClientSize = new System.Drawing.Size(252, 232);
		base.Controls.Add(this.Cancel);
		base.Controls.Add(this.Select);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "Boards";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select Boards";
		base.TopMost = true;
		base.Load += new System.EventHandler(Boards_Load);
		base.ResumeLayout(false);
	}
}
