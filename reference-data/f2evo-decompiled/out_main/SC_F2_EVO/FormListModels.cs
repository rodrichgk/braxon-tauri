using System;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class FormListModels : Form
{
	public int ID_ABS = -1;

	private string StringaConnessione;

	private byte TypeList;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private DataTable ListModels;

	private IContainer components = null;

	private DataGridView Models;

	private DataGridViewTextBoxColumn IDField;

	private DataGridViewTextBoxColumn ID_ProduttoreField;

	private DataGridViewTextBoxColumn ModelField;

	private DataGridViewTextBoxColumn CodeField;

	public FormListModels(byte typelist)
	{
		InitializeComponent();
		TypeList = typelist;
		Models.AutoGenerateColumns = false;
		string text = "";
		if (TypeList == 0)
		{
			text = "SELECT ID, ID_Produttore, Nome, Code FROM Modelli ORDER BY Nome";
			StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		}
		else
		{
			text = "SELECT ID, Nome, CodiceABS AS Code FROM ABS ORDER BY Nome";
			StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
			CodeField.Visible = false;
			Text = "Select Model";
		}
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter(Command);
		Adapter.SelectCommand.CommandText = text;
		ListModels = new DataTable();
		Adapter.Fill(ListModels);
		ListModels.DefaultView.Sort = "Nome";
	}

	private void FormListModels_Load(object sender, EventArgs e)
	{
		Models.DataMember = "Modelli";
		Models.DataSource = ListModels;
	}

	private void Models_RowHeaderMouseDoubleClick(object sender, DataGridViewCellMouseEventArgs e)
	{
		int num = (int)Models["IDField", e.RowIndex].Value;
		if (TypeList == 0)
		{
			int idproduttore = (int)Models["ID_ProduttoreField", e.RowIndex].Value;
			string nome = Models["ModelField", e.RowIndex].Value.ToString();
			new ModelloForm(idproduttore, num, nome).ShowDialog();
		}
		else
		{
			ID_ABS = num;
			base.DialogResult = DialogResult.OK;
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
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle = new System.Windows.Forms.DataGridViewCellStyle();
		System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
		this.Models = new System.Windows.Forms.DataGridView();
		this.IDField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.ID_ProduttoreField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.ModelField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.CodeField = new System.Windows.Forms.DataGridViewTextBoxColumn();
		((System.ComponentModel.ISupportInitialize)this.Models).BeginInit();
		base.SuspendLayout();
		this.Models.AllowUserToAddRows = false;
		this.Models.AllowUserToDeleteRows = false;
		this.Models.AllowUserToResizeColumns = false;
		this.Models.AllowUserToResizeRows = false;
		dataGridViewCellStyle.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
		dataGridViewCellStyle.BackColor = System.Drawing.SystemColors.Control;
		dataGridViewCellStyle.Font = new System.Drawing.Font("Microsoft Sans Serif", 9.75f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle.ForeColor = System.Drawing.SystemColors.WindowText;
		dataGridViewCellStyle.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
		this.Models.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle;
		this.Models.Columns.AddRange(this.IDField, this.ID_ProduttoreField, this.ModelField, this.CodeField);
		this.Models.Location = new System.Drawing.Point(3, 3);
		this.Models.Name = "Models";
		this.Models.ReadOnly = true;
		this.Models.ShowEditingIcon = false;
		this.Models.Size = new System.Drawing.Size(326, 615);
		this.Models.TabIndex = 0;
		this.Models.RowHeaderMouseDoubleClick += new System.Windows.Forms.DataGridViewCellMouseEventHandler(Models_RowHeaderMouseDoubleClick);
		this.IDField.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.IDField.DataPropertyName = "ID";
		dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
		this.IDField.DefaultCellStyle = dataGridViewCellStyle2;
		this.IDField.HeaderText = "ID";
		this.IDField.Name = "IDField";
		this.IDField.ReadOnly = true;
		this.IDField.Visible = false;
		this.ID_ProduttoreField.DataPropertyName = "ID_Produttore";
		this.ID_ProduttoreField.HeaderText = "ID_Produttore";
		this.ID_ProduttoreField.Name = "ID_ProduttoreField";
		this.ID_ProduttoreField.ReadOnly = true;
		this.ID_ProduttoreField.Visible = false;
		this.ModelField.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.Fill;
		this.ModelField.DataPropertyName = "Nome";
		this.ModelField.HeaderText = "Model";
		this.ModelField.Name = "ModelField";
		this.ModelField.ReadOnly = true;
		this.CodeField.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.CodeField.DataPropertyName = "Code";
		this.CodeField.HeaderText = "Code";
		this.CodeField.Name = "CodeField";
		this.CodeField.ReadOnly = true;
		this.CodeField.Width = 69;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(333, 620);
		base.Controls.Add(this.Models);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormListModels";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "List Models";
		base.Load += new System.EventHandler(FormListModels_Load);
		((System.ComponentModel.ISupportInitialize)this.Models).EndInit();
		base.ResumeLayout(false);
	}
}
