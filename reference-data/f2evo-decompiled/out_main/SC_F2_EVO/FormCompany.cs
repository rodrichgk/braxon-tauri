using System;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class FormCompany : Form
{
	public int ID = -1;

	public int ClientSelected;

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private IContainer components = null;

	private Button Save;

	private Button Cancel;

	private Label label2;

	private Label label1;

	public TextBox Address;

	public ComboBox BusinessName;

	private Button Logo;

	public OpenFileDialog OpenFile;

	public CheckBox InsertLOGO;

	private Label label3;

	private Label label13;

	private Label label14;

	private Label label12;

	private Label label15;

	private Label label11;

	private Label label16;

	private Label label8;

	private Label label6;

	private Label label9;

	public TextBox VATNumber;

	public TextBox Province;

	public TextBox Country;

	public TextBox City;

	public TextBox Email;

	public TextBox Fax;

	public TextBox Phone;

	public TextBox Mobile;

	public TextBox Prefix;

	public TextBox CAP;

	private TextBox TaxIDCode;

	private Label label4;

	private Button NewClient;

	private new Button Update;

	private Button Delete;

	public FormCompany(int selected)
	{
		InitializeComponent();
		ClientSelected = selected;
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=Clients.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
	}

	private void FormCompany_Load(object sender, EventArgs e)
	{
		DataTable dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT ID, CompanyName FROM Customers ORDER BY CompanyName";
		Adapter.Fill(dataTable);
		BusinessName.ValueMember = "ID";
		BusinessName.DisplayMember = "CompanyName";
		BusinessName.DataSource = dataTable;
	}

	private void Fill()
	{
		DataTable dataTable = new DataTable();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Customers WHERE ID=" + ID;
		Adapter.Fill(dataTable);
		if (dataTable.Rows.Count > 0)
		{
			BusinessName.Text = dataTable.Rows[0]["CompanyName"].ToString();
			TaxIDCode.Text = dataTable.Rows[0]["TaxIDCode"].ToString();
			Email.Text = dataTable.Rows[0]["Email"].ToString();
			VATNumber.Text = dataTable.Rows[0]["VATNumber"].ToString();
			Country.Text = dataTable.Rows[0]["Country"].ToString();
			Province.Text = dataTable.Rows[0]["Province"].ToString();
			City.Text = dataTable.Rows[0]["City"].ToString();
			Address.Text = dataTable.Rows[0]["Address"].ToString();
			Prefix.Text = dataTable.Rows[0]["Prefix"].ToString();
			Mobile.Text = dataTable.Rows[0]["Mobile"].ToString();
			Phone.Text = dataTable.Rows[0]["Phone"].ToString();
			CAP.Text = dataTable.Rows[0]["CAP"].ToString();
			Fax.Text = dataTable.Rows[0]["Fax"].ToString();
			{
				foreach (Control control in base.Controls)
				{
					if (control is TextBox)
					{
						((TextBox)control).ReadOnly = true;
					}
				}
				return;
			}
		}
		BusinessName.Text = "";
		TaxIDCode.Text = "";
		Email.Text = "";
		VATNumber.Text = "";
		Country.Text = "";
		Province.Text = "";
		City.Text = "";
		Address.Text = "";
		Prefix.Text = "";
		Mobile.Text = "";
		Phone.Text = "";
		CAP.Text = "";
		Fax.Text = "";
		BusinessName.SelectedIndex = -1;
	}

	private void Save_Click(object sender, EventArgs e)
	{
		try
		{
			string text;
			if (ID == -1)
			{
				text = "INSERT INTO Customers ([CompanyName], [TaxIDCode], [Email], [VATNumber], [Country], [Province], [City], [Address], [Prefix], [Mobile], [Phone], [CAP], [Fax]) VALUES (";
				text = text + "'" + BusinessName.Text.Replace("'", "''") + "',";
				text = text + "'" + TaxIDCode.Text + "',";
				text = text + "'" + Email.Text + "',";
				text = text + "'" + VATNumber.Text + "',";
				text = text + "'" + Country.Text.Replace("'", "''") + "',";
				text = text + "'" + Province.Text.Replace("'", "''") + "',";
				text = text + "'" + City.Text.Replace("'", "''") + "',";
				text = text + "'" + Address.Text.Replace("'", "''") + "',";
				text = text + "'" + Prefix.Text + "',";
				text = text + "'" + Mobile.Text + "',";
				text = text + "'" + Phone.Text + "',";
				text = text + "'" + CAP.Text + "',";
				text = text + "'" + Fax.Text + "'";
				text += ")";
			}
			else
			{
				text = "UPDATE Customers SET ";
				text = text + "[CompanyName]='" + BusinessName.Text.Replace("'", "''") + "', ";
				text = text + "[TaxIDCode]='" + TaxIDCode.Text + "', ";
				text = text + "[Email]='" + Email.Text + "', ";
				text = text + "[VATNumber]='" + VATNumber.Text + "', ";
				text = text + "[Country]='" + Country.Text.Replace("'", "''").Replace(",", ",,") + "', ";
				text = text + "[Province]='" + Province.Text.Replace("'", "''").Replace(",", ",,") + "', ";
				text = text + "[City]='" + City.Text.Replace("'", "''").Replace(",", ",,") + "', ";
				text = text + "[Address]='" + Address.Text.Replace("'", "''").Replace(",", ",,") + "', ";
				text = text + "[Prefix]='" + Prefix.Text + "', ";
				text = text + "[Mobile]='" + Mobile.Text + "', ";
				text = text + "[Phone]='" + Phone.Text + "', ";
				text = text + "[CAP]='" + CAP.Text + "', ";
				text = text + "[Fax]='" + Fax.Text + "'";
				text = text + " WHERE ID=" + ID;
			}
			if (!ExecuteQuery(text, out var message))
			{
				throw new Exception(message);
			}
			if (sender != null)
			{
				MessageBox.Show("Customer saved.", "Information", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
				if (ID == -1)
				{
					FormCompany_Load(null, null);
				}
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
		finally
		{
			BusinessName.DropDownStyle = ComboBoxStyle.DropDownList;
		}
	}

	private void Cancel_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.OK;
	}

	private void Icon_Click(object sender, EventArgs e)
	{
		if (OpenFile.ShowDialog() == DialogResult.OK)
		{
			File.Copy(OpenFile.FileName, "Logo1.jpg", overwrite: true);
		}
	}

	private void BusinessName_SelectedIndexChanged(object sender, EventArgs e)
	{
		if (BusinessName.SelectedValue is int)
		{
			if (ClientSelected > -1)
			{
				ID = ClientSelected;
				ClientSelected = -1;
			}
			else
			{
				ID = (int)BusinessName.SelectedValue;
			}
			Fill();
		}
	}

	private void NewClient_Click(object sender, EventArgs e)
	{
		ID = -1;
		BusinessName.DropDownStyle = ComboBoxStyle.Simple;
		Fill();
		foreach (Control control in base.Controls)
		{
			if (control is TextBox)
			{
				((TextBox)control).ReadOnly = false;
			}
		}
	}

	private void Update_Click(object sender, EventArgs e)
	{
		BusinessName.DropDownStyle = ComboBoxStyle.Simple;
		foreach (Control control in base.Controls)
		{
			if (control is TextBox)
			{
				((TextBox)control).ReadOnly = false;
			}
		}
	}

	private bool ExecuteQuery(string query, out string message)
	{
		OleDbTransaction oleDbTransaction = null;
		try
		{
			Command.Connection.Open();
			oleDbTransaction = Command.Connection.BeginTransaction();
			Command.Transaction = oleDbTransaction;
			Command.CommandText = query;
			Command.ExecuteNonQuery();
			oleDbTransaction.Commit();
			message = "";
			return true;
		}
		catch (Exception ex)
		{
			oleDbTransaction.Rollback();
			message = ex.Message;
			return false;
		}
		finally
		{
			Command.Connection.Close();
		}
	}

	private void Delete_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Do you want to delete the selected customer?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No && MessageBox.Show("Are you sure you want to proceed?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No)
		{
			string query = "DELETE FROM Customers WHERE ID = " + BusinessName.SelectedValue;
			ExecuteQuery(query, out var _);
			FormCompany_Load(null, null);
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
		this.Save = new System.Windows.Forms.Button();
		this.Cancel = new System.Windows.Forms.Button();
		this.label2 = new System.Windows.Forms.Label();
		this.Address = new System.Windows.Forms.TextBox();
		this.label1 = new System.Windows.Forms.Label();
		this.BusinessName = new System.Windows.Forms.ComboBox();
		this.Logo = new System.Windows.Forms.Button();
		this.OpenFile = new System.Windows.Forms.OpenFileDialog();
		this.InsertLOGO = new System.Windows.Forms.CheckBox();
		this.label3 = new System.Windows.Forms.Label();
		this.CAP = new System.Windows.Forms.TextBox();
		this.label13 = new System.Windows.Forms.Label();
		this.VATNumber = new System.Windows.Forms.TextBox();
		this.label14 = new System.Windows.Forms.Label();
		this.Province = new System.Windows.Forms.TextBox();
		this.label12 = new System.Windows.Forms.Label();
		this.Country = new System.Windows.Forms.TextBox();
		this.label15 = new System.Windows.Forms.Label();
		this.City = new System.Windows.Forms.TextBox();
		this.Email = new System.Windows.Forms.TextBox();
		this.label11 = new System.Windows.Forms.Label();
		this.label16 = new System.Windows.Forms.Label();
		this.Fax = new System.Windows.Forms.TextBox();
		this.label8 = new System.Windows.Forms.Label();
		this.Phone = new System.Windows.Forms.TextBox();
		this.label6 = new System.Windows.Forms.Label();
		this.Mobile = new System.Windows.Forms.TextBox();
		this.label9 = new System.Windows.Forms.Label();
		this.Prefix = new System.Windows.Forms.TextBox();
		this.TaxIDCode = new System.Windows.Forms.TextBox();
		this.label4 = new System.Windows.Forms.Label();
		this.NewClient = new System.Windows.Forms.Button();
		this.Update = new System.Windows.Forms.Button();
		this.Delete = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.Save.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Save.Location = new System.Drawing.Point(35, 405);
		this.Save.Name = "Save";
		this.Save.Size = new System.Drawing.Size(75, 29);
		this.Save.TabIndex = 15;
		this.Save.Text = "Save";
		this.Save.UseVisualStyleBackColor = true;
		this.Save.Click += new System.EventHandler(Save_Click);
		this.Cancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		this.Cancel.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Cancel.Location = new System.Drawing.Point(608, 405);
		this.Cancel.Name = "Cancel";
		this.Cancel.Size = new System.Drawing.Size(75, 29);
		this.Cancel.TabIndex = 16;
		this.Cancel.Text = "OK";
		this.Cancel.UseVisualStyleBackColor = true;
		this.Cancel.Click += new System.EventHandler(Cancel_Click);
		this.label2.AutoSize = true;
		this.label2.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label2.Location = new System.Drawing.Point(5, 66);
		this.label2.Name = "label2";
		this.label2.Size = new System.Drawing.Size(80, 20);
		this.label2.TabIndex = 43;
		this.label2.Text = "Address:";
		this.Address.BackColor = System.Drawing.Color.White;
		this.Address.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Address.Location = new System.Drawing.Point(9, 89);
		this.Address.Name = "Address";
		this.Address.Size = new System.Drawing.Size(346, 22);
		this.Address.TabIndex = 3;
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(4, 11);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(138, 20);
		this.label1.TabIndex = 47;
		this.label1.Text = "Business Name:";
		this.BusinessName.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.BusinessName.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.BusinessName.Location = new System.Drawing.Point(9, 34);
		this.BusinessName.Name = "BusinessName";
		this.BusinessName.Size = new System.Drawing.Size(346, 24);
		this.BusinessName.TabIndex = 0;
		this.BusinessName.SelectedIndexChanged += new System.EventHandler(BusinessName_SelectedIndexChanged);
		this.Logo.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Logo.Location = new System.Drawing.Point(396, 298);
		this.Logo.Name = "Logo";
		this.Logo.Size = new System.Drawing.Size(75, 42);
		this.Logo.TabIndex = 13;
		this.Logo.Text = "Logo";
		this.Logo.UseVisualStyleBackColor = true;
		this.Logo.Click += new System.EventHandler(Icon_Click);
		this.OpenFile.Filter = "jpg files|*.jpg|png files|*.png|bmp files|*.bmp|all files|*.*";
		this.InsertLOGO.AutoSize = true;
		this.InsertLOGO.CheckAlign = System.Drawing.ContentAlignment.MiddleRight;
		this.InsertLOGO.Checked = true;
		this.InsertLOGO.CheckState = System.Windows.Forms.CheckState.Checked;
		this.InsertLOGO.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold);
		this.InsertLOGO.Location = new System.Drawing.Point(477, 308);
		this.InsertLOGO.Name = "InsertLOGO";
		this.InsertLOGO.Size = new System.Drawing.Size(130, 24);
		this.InsertLOGO.TabIndex = 14;
		this.InsertLOGO.Text = "Insert LOGO";
		this.InsertLOGO.UseVisualStyleBackColor = true;
		this.label3.AutoSize = true;
		this.label3.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label3.Location = new System.Drawing.Point(4, 286);
		this.label3.Name = "label3";
		this.label3.Size = new System.Drawing.Size(64, 20);
		this.label3.TabIndex = 102;
		this.label3.Text = "C.A.P.:";
		this.CAP.BackColor = System.Drawing.Color.White;
		this.CAP.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.CAP.Location = new System.Drawing.Point(8, 309);
		this.CAP.Name = "CAP";
		this.CAP.Size = new System.Drawing.Size(96, 22);
		this.CAP.TabIndex = 11;
		this.label13.AutoSize = true;
		this.label13.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label13.Location = new System.Drawing.Point(393, 11);
		this.label13.Name = "label13";
		this.label13.Size = new System.Drawing.Size(115, 20);
		this.label13.TabIndex = 101;
		this.label13.Text = "VAT Number:";
		this.VATNumber.BackColor = System.Drawing.Color.White;
		this.VATNumber.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.VATNumber.Location = new System.Drawing.Point(397, 34);
		this.VATNumber.Name = "VATNumber";
		this.VATNumber.Size = new System.Drawing.Size(152, 22);
		this.VATNumber.TabIndex = 1;
		this.label14.AutoSize = true;
		this.label14.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label14.Location = new System.Drawing.Point(5, 176);
		this.label14.Name = "label14";
		this.label14.Size = new System.Drawing.Size(82, 20);
		this.label14.TabIndex = 100;
		this.label14.Text = "Province:";
		this.Province.BackColor = System.Drawing.Color.White;
		this.Province.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Province.Location = new System.Drawing.Point(9, 199);
		this.Province.Name = "Province";
		this.Province.Size = new System.Drawing.Size(346, 22);
		this.Province.TabIndex = 7;
		this.label12.AutoSize = true;
		this.label12.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label12.Location = new System.Drawing.Point(4, 231);
		this.label12.Name = "label12";
		this.label12.Size = new System.Drawing.Size(76, 20);
		this.label12.TabIndex = 106;
		this.label12.Text = "Country:";
		this.Country.BackColor = System.Drawing.Color.White;
		this.Country.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Country.Location = new System.Drawing.Point(8, 254);
		this.Country.Name = "Country";
		this.Country.Size = new System.Drawing.Size(347, 22);
		this.Country.TabIndex = 9;
		this.label15.AutoSize = true;
		this.label15.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label15.Location = new System.Drawing.Point(5, 121);
		this.label15.Name = "label15";
		this.label15.Size = new System.Drawing.Size(44, 20);
		this.label15.TabIndex = 105;
		this.label15.Text = "City:";
		this.City.BackColor = System.Drawing.Color.White;
		this.City.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.City.Location = new System.Drawing.Point(8, 144);
		this.City.Name = "City";
		this.City.Size = new System.Drawing.Size(347, 22);
		this.City.TabIndex = 5;
		this.Email.BackColor = System.Drawing.Color.White;
		this.Email.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Email.Location = new System.Drawing.Point(397, 89);
		this.Email.Name = "Email";
		this.Email.Size = new System.Drawing.Size(311, 22);
		this.Email.TabIndex = 4;
		this.label11.AutoSize = true;
		this.label11.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label11.Location = new System.Drawing.Point(393, 66);
		this.label11.Name = "label11";
		this.label11.Size = new System.Drawing.Size(58, 20);
		this.label11.TabIndex = 108;
		this.label11.Text = "Email:";
		this.label16.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label16.AutoSize = true;
		this.label16.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label16.Location = new System.Drawing.Point(393, 121);
		this.label16.Name = "label16";
		this.label16.Size = new System.Drawing.Size(43, 20);
		this.label16.TabIndex = 114;
		this.label16.Text = "Fax:";
		this.Fax.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Fax.BackColor = System.Drawing.Color.White;
		this.Fax.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Fax.Location = new System.Drawing.Point(396, 144);
		this.Fax.Name = "Fax";
		this.Fax.Size = new System.Drawing.Size(312, 22);
		this.Fax.TabIndex = 6;
		this.label8.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label8.AutoSize = true;
		this.label8.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label8.Location = new System.Drawing.Point(393, 231);
		this.label8.Name = "label8";
		this.label8.Size = new System.Drawing.Size(65, 20);
		this.label8.TabIndex = 113;
		this.label8.Text = "Phone:";
		this.Phone.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Phone.BackColor = System.Drawing.Color.White;
		this.Phone.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Phone.Location = new System.Drawing.Point(396, 254);
		this.Phone.Name = "Phone";
		this.Phone.Size = new System.Drawing.Size(311, 22);
		this.Phone.TabIndex = 10;
		this.label6.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label6.AutoSize = true;
		this.label6.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label6.Location = new System.Drawing.Point(392, 176);
		this.label6.Name = "label6";
		this.label6.Size = new System.Drawing.Size(66, 20);
		this.label6.TabIndex = 112;
		this.label6.Text = "Mobile:";
		this.Mobile.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Mobile.BackColor = System.Drawing.Color.White;
		this.Mobile.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Mobile.Location = new System.Drawing.Point(396, 199);
		this.Mobile.Name = "Mobile";
		this.Mobile.Size = new System.Drawing.Size(312, 22);
		this.Mobile.TabIndex = 8;
		this.label9.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.label9.AutoSize = true;
		this.label9.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label9.Location = new System.Drawing.Point(281, 289);
		this.label9.Name = "label9";
		this.label9.Size = new System.Drawing.Size(74, 16);
		this.label9.TabIndex = 116;
		this.label9.Text = "Int. Prefix:";
		this.Prefix.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
		this.Prefix.BackColor = System.Drawing.Color.White;
		this.Prefix.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.Prefix.Location = new System.Drawing.Point(295, 309);
		this.Prefix.Name = "Prefix";
		this.Prefix.Size = new System.Drawing.Size(60, 22);
		this.Prefix.TabIndex = 12;
		this.Prefix.Text = "+39";
		this.TaxIDCode.BackColor = System.Drawing.Color.White;
		this.TaxIDCode.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
		this.TaxIDCode.Location = new System.Drawing.Point(553, 34);
		this.TaxIDCode.Name = "TaxIDCode";
		this.TaxIDCode.Size = new System.Drawing.Size(152, 22);
		this.TaxIDCode.TabIndex = 2;
		this.label4.AutoSize = true;
		this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.label4.Location = new System.Drawing.Point(549, 11);
		this.label4.Name = "label4";
		this.label4.Size = new System.Drawing.Size(110, 20);
		this.label4.TabIndex = 118;
		this.label4.Text = "Tax ID code:";
		this.NewClient.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.NewClient.Location = new System.Drawing.Point(180, 405);
		this.NewClient.Name = "NewClient";
		this.NewClient.Size = new System.Drawing.Size(58, 29);
		this.NewClient.TabIndex = 119;
		this.NewClient.Text = "New";
		this.NewClient.UseVisualStyleBackColor = true;
		this.NewClient.Click += new System.EventHandler(NewClient_Click);
		this.Update.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Update.Location = new System.Drawing.Point(308, 405);
		this.Update.Name = "Update";
		this.Update.Size = new System.Drawing.Size(80, 29);
		this.Update.TabIndex = 120;
		this.Update.Text = "Update";
		this.Update.UseVisualStyleBackColor = true;
		this.Update.Click += new System.EventHandler(Update_Click);
		this.Delete.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Delete.Location = new System.Drawing.Point(458, 405);
		this.Delete.Name = "Delete";
		this.Delete.Size = new System.Drawing.Size(80, 29);
		this.Delete.TabIndex = 121;
		this.Delete.Text = "Delete";
		this.Delete.UseVisualStyleBackColor = true;
		this.Delete.Click += new System.EventHandler(Delete_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(718, 446);
		base.Controls.Add(this.Delete);
		base.Controls.Add(this.Update);
		base.Controls.Add(this.NewClient);
		base.Controls.Add(this.TaxIDCode);
		base.Controls.Add(this.label4);
		base.Controls.Add(this.label9);
		base.Controls.Add(this.Prefix);
		base.Controls.Add(this.label16);
		base.Controls.Add(this.Fax);
		base.Controls.Add(this.label8);
		base.Controls.Add(this.Phone);
		base.Controls.Add(this.label6);
		base.Controls.Add(this.Mobile);
		base.Controls.Add(this.Email);
		base.Controls.Add(this.label11);
		base.Controls.Add(this.label12);
		base.Controls.Add(this.Country);
		base.Controls.Add(this.label15);
		base.Controls.Add(this.City);
		base.Controls.Add(this.label3);
		base.Controls.Add(this.CAP);
		base.Controls.Add(this.label13);
		base.Controls.Add(this.VATNumber);
		base.Controls.Add(this.label14);
		base.Controls.Add(this.Province);
		base.Controls.Add(this.InsertLOGO);
		base.Controls.Add(this.Logo);
		base.Controls.Add(this.label1);
		base.Controls.Add(this.BusinessName);
		base.Controls.Add(this.label2);
		base.Controls.Add(this.Address);
		base.Controls.Add(this.Cancel);
		base.Controls.Add(this.Save);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormCompany";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Company Data";
		base.Load += new System.EventHandler(FormCompany_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
