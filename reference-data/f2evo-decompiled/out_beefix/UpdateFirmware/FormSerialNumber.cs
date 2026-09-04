using System;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Windows.Forms;

namespace UpdateFirmware;

public class FormSerialNumber : Form
{
	private DataTable Table;

	private ushort Mask = 0;

	private License.FIELDS flds = default(License.FIELDS);

	public new string CompanyName;

	public string UserName;

	public string Code;

	private IContainer components = null;

	private ListBox Clients;

	private Label label1;

	private Label label2;

	private Button Salva;

	public TextBox SerialNumber;

	public CheckBox UpdateLicense;

	public FormSerialNumber(ushort mask)
	{
		InitializeComponent();
		Mask = mask;
		Table = new DataTable();
	}

	private void FormSerialNumber_Load(object sender, EventArgs e)
	{
		for (int i = 0; i < 16; i++)
		{
			if (Mask % 2 == 1)
			{
				byte b = 0;
				do
				{
					MainForm.DataBase.SelectCommand.CommandText = "SELECT ID, CompanyName, SerialNumber, UserName, Mask, Scadenza FROM Clients WHERE (NOT SerialNumber IS NULL) AND (NOT Trim(SerialNumber) = '') AND (((Mask\\(2^" + i + ")) mod 2) = 1) ORDER BY CompanyName";
					MainForm.DataBase.Fill(Table);
				}
				while (MainForm.DataBase.Error && b++ < 3);
			}
			Mask /= 2;
		}
		Clients.DisplayMember = "CompanyName";
		Clients.ValueMember = "ID";
		Clients.DataSource = Table;
	}

	private void Clients_SelectedIndexChanged(object sender, EventArgs e)
	{
		if (Clients.SelectedValue != null)
		{
			DataRow dataRow = Table.Select("ID = " + Clients.SelectedValue)[0];
			SerialNumber.Text = dataRow["SerialNumber"].ToString();
			CompanyName = dataRow["CompanyName"].ToString();
			UserName = dataRow["UserName"].ToString();
			ushort mask = (ushort)(short)dataRow["Mask"];
			DateTime scadenza = (DateTime)dataRow["Scadenza"];
			flds.User = UserName;
			flds.Scadenza = scadenza;
			flds.Mask = mask;
			Code = License.EncoderField(flds);
		}
	}

	private void Salva_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.OK;
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
		this.Clients = new System.Windows.Forms.ListBox();
		this.label1 = new System.Windows.Forms.Label();
		this.label2 = new System.Windows.Forms.Label();
		this.SerialNumber = new System.Windows.Forms.TextBox();
		this.Salva = new System.Windows.Forms.Button();
		this.UpdateLicense = new System.Windows.Forms.CheckBox();
		base.SuspendLayout();
		this.Clients.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.Clients.FormattingEnabled = true;
		this.Clients.ItemHeight = 16;
		this.Clients.Location = new System.Drawing.Point(6, 38);
		this.Clients.Name = "Clients";
		this.Clients.Size = new System.Drawing.Size(772, 484);
		this.Clients.TabIndex = 0;
		this.Clients.SelectedIndexChanged += new System.EventHandler(Clients_SelectedIndexChanged);
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(6, 10);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(59, 20);
		this.label1.TabIndex = 1;
		this.label1.Text = "Clienti";
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(169, 10);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(122, 20);
		this.label2.TabIndex = 2;
		this.label2.Text = "SerialNumber:";
		this.SerialNumber.BackColor = System.Drawing.Color.White;
		this.SerialNumber.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		this.SerialNumber.Location = new System.Drawing.Point(297, 9);
		this.SerialNumber.Name = "SerialNumber";
		this.SerialNumber.ReadOnly = true;
		this.SerialNumber.Size = new System.Drawing.Size(136, 22);
		this.SerialNumber.TabIndex = 3;
		this.Salva.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Salva.Location = new System.Drawing.Point(688, 5);
		this.Salva.Name = "Salva";
		this.Salva.Size = new System.Drawing.Size(90, 30);
		this.Salva.TabIndex = 4;
		this.Salva.Text = "Salva";
		this.Salva.UseVisualStyleBackColor = true;
		this.Salva.Click += new System.EventHandler(Salva_Click);
		this.UpdateLicense.AutoSize = true;
		this.UpdateLicense.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.UpdateLicense.Location = new System.Drawing.Point(473, 8);
		this.UpdateLicense.Name = "UpdateLicense";
		this.UpdateLicense.Size = new System.Drawing.Size(154, 24);
		this.UpdateLicense.TabIndex = 17;
		this.UpdateLicense.Text = "Update License";
		this.UpdateLicense.UseVisualStyleBackColor = true;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(780, 524);
		base.Controls.Add(this.UpdateLicense);
		base.Controls.Add(this.Salva);
		base.Controls.Add(this.SerialNumber);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Clients);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormSerialNumber";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Serial Number";
		base.Load += new System.EventHandler(FormSerialNumber_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
