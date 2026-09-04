using System;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class NewProduttoreForm : Form
{
	private string StringaConnessione;

	private string Tabella;

	private DataTable Table;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private IContainer components = null;

	public ComboBox Produttore;

	public Label label1;

	public NewProduttoreForm(bool select, string tabella)
	{
		InitializeComponent();
		Tabella = tabella;
		if (select)
		{
			StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=Electronics.accdb";
			Connessione = new OleDbConnection(StringaConnessione);
			Command = new OleDbCommand("", Connessione);
			adapter = new OleDbDataAdapter(Command);
			Table = new DataTable();
			Command.CommandText = "SELECT * FROM Produttori ORDER BY Nome";
			adapter.Fill(Table);
			Produttore.DataSource = Table;
			Produttore.DisplayMember = "Nome";
			Produttore.ValueMember = "ID";
			Produttore.DropDownStyle = ComboBoxStyle.DropDownList;
			Produttore.SelectedIndex = -1;
		}
	}

	private void Boards_Load(object sender, EventArgs e)
	{
		int num = 0;
	}

	private void Produttore_KeyUp(object sender, KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Escape)
		{
			base.DialogResult = DialogResult.Cancel;
			Close();
		}
		if (e.KeyCode == Keys.Return)
		{
			base.DialogResult = DialogResult.OK;
			if (Produttore.Text.Trim() == "")
			{
				base.DialogResult = DialogResult.Cancel;
			}
			Close();
		}
	}

	private void Produttore_SelectedIndexChanged(object sender, EventArgs e)
	{
		if (Produttore.SelectedValue != null && !(Produttore.SelectedValue.GetType() != typeof(int)) && MessageBox.Show("Confermi " + Tabella + "?", "Question", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.No)
		{
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
		this.Produttore = new System.Windows.Forms.ComboBox();
		this.label1 = new System.Windows.Forms.Label();
		base.SuspendLayout();
		this.Produttore.DropDownStyle = System.Windows.Forms.ComboBoxStyle.Simple;
		this.Produttore.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Produttore.IntegralHeight = false;
		this.Produttore.Location = new System.Drawing.Point(107, 12);
		this.Produttore.MaxDropDownItems = 20;
		this.Produttore.Name = "Produttore";
		this.Produttore.Size = new System.Drawing.Size(267, 28);
		this.Produttore.TabIndex = 0;
		this.Produttore.SelectedIndexChanged += new System.EventHandler(Produttore_SelectedIndexChanged);
		this.Produttore.KeyUp += new System.Windows.Forms.KeyEventHandler(Produttore_KeyUp);
		this.label1.AutoSize = true;
		this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.label1.Location = new System.Drawing.Point(2, 15);
		this.label1.Name = "label1";
		this.label1.Size = new System.Drawing.Size(92, 20);
		this.label1.TabIndex = 1;
		this.label1.Text = "Productor:";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(378, 70);
		base.ControlBox = false;
		base.Controls.Add(this.label1);
		base.Controls.Add(this.Produttore);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "NewProduttoreForm";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "New Productor";
		base.Load += new System.EventHandler(Boards_Load);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
