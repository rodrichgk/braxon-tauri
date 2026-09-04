using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class FormChannels : Form
{
	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private DataTable ChannelData;

	private List<int> ID_DEL;

	private IContainer components = null;

	private DataGridView Channel;

	private Button Salva;

	private ComboBox Canali;

	private Button Chiudi;

	private DataGridViewTextBoxColumn ID;

	private DataGridViewCheckBoxColumn ControlloPressione;

	private DataGridViewTextBoxColumn Pressione;

	private DataGridViewTextBoxColumn Impulso;

	private DataGridViewTextBoxColumn Impulsi;

	private DataGridViewCheckBoxColumn Pompa;

	private DataGridViewCheckBoxColumn Motore;

	public FormChannels()
	{
		InitializeComponent();
		ID_DEL = new List<int>();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=HydraulicData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter("", Connessione);
		ChannelData = new DataTable();
		ChannelData.TableNewRow += ChannelData_TableNewRow;
		ChannelData.RowDeleting += ChannelData_RowDeleting;
		ChannelData.RowDeleted += ChannelData_RowDeleted;
		Channel.AutoGenerateColumns = false;
	}

	private void ChannelData_RowDeleted(object sender, DataRowChangeEventArgs e)
	{
	}

	private void ChannelData_RowDeleting(object sender, DataRowChangeEventArgs e)
	{
		if (e.Row["ID"] != DBNull.Value)
		{
			ID_DEL.Add((int)e.Row["ID"]);
		}
	}

	private void ChannelData_TableNewRow(object sender, DataTableNewRowEventArgs e)
	{
		byte b = 1;
		foreach (DataRow row in ChannelData.Rows)
		{
			if (row.RowState != DataRowState.Deleted)
			{
				row["Ciclo"] = b++;
			}
		}
	}

	private void FormChannels_Load(object sender, EventArgs e)
	{
		Canali.SelectedIndex = 0;
	}

	private void Canali_SelectedIndexChanged(object sender, EventArgs e)
	{
		ChannelData.Clear();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Canali WHERE Canale = " + (Canali.SelectedIndex + 1) + " ORDER BY Ciclo";
		Adapter.Fill(ChannelData);
		ChannelData.Columns["Canale"].DefaultValue = (byte)(Canali.SelectedIndex + 1);
		ChannelData.Columns["OnOff"].DefaultValue = false;
		ChannelData.Columns["Pressione"].DefaultValue = 20;
		ChannelData.Columns["Impulso"].DefaultValue = 100;
		ChannelData.Columns["Impulsi"].DefaultValue = 5;
		ChannelData.Columns["Pompa"].DefaultValue = false;
		ChannelData.Columns["Motore"].DefaultValue = false;
		Channel.DataMember = ChannelData.TableName;
		Channel.DataSource = ChannelData;
	}

	private void Salva_Click(object sender, EventArgs e)
	{
		DataTable dataTable = new DataTable();
		string query = "";
		string text = ",";
		ChannelData_TableNewRow(null, null);
		Command.Connection.Open();
		string message;
		foreach (DataRow row in ChannelData.Rows)
		{
			if (row.RowState != DataRowState.Deleted)
			{
				Command.CommandText = "SELECT Count(*) AS N FROM Canali WHERE Canale = " + (Canali.SelectedIndex + 1) + " AND ID = " + ((row["ID"] != DBNull.Value) ? row["ID"] : ((object)(-1)));
				int num = (int)Command.ExecuteScalar();
				if (num == 0)
				{
					query = "INSERT INTO Canali ([Canale], [Ciclo], [OnOff], [Pressione], [Impulso], [Impulsi], [Pompa], [Motore]) VALUES (";
					query = query + (Canali.SelectedIndex + 1) + ",";
					query = query + row["Ciclo"]?.ToString() + ",";
					query = query + row["OnOff"]?.ToString() + ",";
					query = query + row["Pressione"]?.ToString() + ",";
					query = query + row["Impulso"]?.ToString() + ",";
					query = query + row["Impulsi"]?.ToString() + ",";
					query = query + row["Pompa"]?.ToString() + ",";
					query += row["Motore"];
					query += ")";
				}
				if (num == 1)
				{
					query = "UPDATE Canali SET ";
					query = query + "Ciclo = " + row["Ciclo"]?.ToString() + ", ";
					query = query + "OnOff = " + row["OnOff"]?.ToString() + ", ";
					query = query + "Pressione = " + row["Pressione"]?.ToString() + ", ";
					query = query + "Impulso = " + row["Impulso"]?.ToString() + ", ";
					query = query + "Impulsi = " + row["Impulsi"]?.ToString() + ", ";
					query = query + "Pompa = " + row["Pompa"]?.ToString() + ", ";
					query = query + "Motore = " + row["Motore"];
					query = query + " WHERE ID = " + row["ID"];
				}
				if (!ExecuteQuery(query, out message))
				{
					throw new Exception(message);
				}
			}
		}
		foreach (int item in ID_DEL)
		{
			text = text + item + ",";
		}
		if (text != ",")
		{
			query = "DELETE FROM Canali WHERE ID IN (-1 " + text + ")";
			if (!ExecuteQuery(query, out message))
			{
				throw new Exception(message);
			}
		}
		Command.Connection.Close();
		ID_DEL.Clear();
		ChannelData.AcceptChanges();
		Adapter.SelectCommand.CommandText = "SELECT * FROM Canali WHERE Canale = " + (Canali.SelectedIndex + 1) + " ORDER BY Ciclo";
		Adapter.Fill(dataTable);
		for (int i = 0; i < dataTable.Rows.Count; i++)
		{
			ChannelData.Rows[i]["ID"] = dataTable.Rows[i]["ID"];
		}
		MessageBox.Show("Salvataggio completato.", "Informazione", MessageBoxButtons.OK, MessageBoxIcon.Asterisk, MessageBoxDefaultButton.Button1);
	}

	private bool ExecuteQuery(string query, out string message)
	{
		OleDbTransaction oleDbTransaction = null;
		try
		{
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
	}

	private void Chiudi_Click(object sender, EventArgs e)
	{
		Close();
	}

	private void Channel_KeyUp(object sender, KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Insert)
		{
			int rowIndex = Channel.CurrentCell.RowIndex;
			DataRow row = ChannelData.NewRow();
			ChannelData.Rows.InsertAt(row, rowIndex);
			Channel.ClearSelection();
			Channel.Rows[rowIndex].Selected = true;
			Channel.CurrentCell = Channel.Rows[rowIndex].Cells[0];
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
		this.Channel = new System.Windows.Forms.DataGridView();
		this.Salva = new System.Windows.Forms.Button();
		this.Canali = new System.Windows.Forms.ComboBox();
		this.Chiudi = new System.Windows.Forms.Button();
		this.ID = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.ControlloPressione = new System.Windows.Forms.DataGridViewCheckBoxColumn();
		this.Pressione = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Impulso = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Impulsi = new System.Windows.Forms.DataGridViewTextBoxColumn();
		this.Pompa = new System.Windows.Forms.DataGridViewCheckBoxColumn();
		this.Motore = new System.Windows.Forms.DataGridViewCheckBoxColumn();
		((System.ComponentModel.ISupportInitialize)this.Channel).BeginInit();
		base.SuspendLayout();
		this.Channel.AllowUserToResizeColumns = false;
		this.Channel.AllowUserToResizeRows = false;
		dataGridViewCellStyle.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
		dataGridViewCellStyle.BackColor = System.Drawing.SystemColors.Control;
		dataGridViewCellStyle.Font = new System.Drawing.Font("Microsoft Sans Serif", 14.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 0);
		dataGridViewCellStyle.ForeColor = System.Drawing.SystemColors.WindowText;
		dataGridViewCellStyle.SelectionBackColor = System.Drawing.SystemColors.Highlight;
		dataGridViewCellStyle.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
		dataGridViewCellStyle.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
		this.Channel.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle;
		this.Channel.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
		this.Channel.Columns.AddRange(this.ID, this.ControlloPressione, this.Pressione, this.Impulso, this.Impulsi, this.Pompa, this.Motore);
		this.Channel.Location = new System.Drawing.Point(8, 43);
		this.Channel.Name = "Channel";
		this.Channel.Size = new System.Drawing.Size(701, 453);
		this.Channel.TabIndex = 0;
		this.Channel.KeyUp += new System.Windows.Forms.KeyEventHandler(Channel_KeyUp);
		this.Salva.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Salva.Location = new System.Drawing.Point(69, 502);
		this.Salva.Name = "Salva";
		this.Salva.Size = new System.Drawing.Size(95, 35);
		this.Salva.TabIndex = 38;
		this.Salva.Text = "Salva";
		this.Salva.UseVisualStyleBackColor = true;
		this.Salva.Click += new System.EventHandler(Salva_Click);
		this.Canali.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.Canali.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Canali.Items.AddRange(new object[4] { "Canale1", "Canale2", "Canale3", "Canale4" });
		this.Canali.Location = new System.Drawing.Point(8, 9);
		this.Canali.Name = "Canali";
		this.Canali.Size = new System.Drawing.Size(118, 28);
		this.Canali.TabIndex = 39;
		this.Canali.SelectedIndexChanged += new System.EventHandler(Canali_SelectedIndexChanged);
		this.Chiudi.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, 0);
		this.Chiudi.Location = new System.Drawing.Point(550, 502);
		this.Chiudi.Name = "Chiudi";
		this.Chiudi.Size = new System.Drawing.Size(95, 35);
		this.Chiudi.TabIndex = 40;
		this.Chiudi.Text = "Chiudi";
		this.Chiudi.UseVisualStyleBackColor = true;
		this.Chiudi.Click += new System.EventHandler(Chiudi_Click);
		this.ID.AutoSizeMode = System.Windows.Forms.DataGridViewAutoSizeColumnMode.AllCells;
		this.ID.DataPropertyName = "Ciclo";
		this.ID.HeaderText = "N°";
		this.ID.Name = "ID";
		this.ID.ReadOnly = true;
		this.ID.Width = 55;
		this.ControlloPressione.DataPropertyName = "OnOff";
		this.ControlloPressione.HeaderText = "Rubineto ON/OFF";
		this.ControlloPressione.Name = "ControlloPressione";
		this.ControlloPressione.Visible = false;
		this.Pressione.DataPropertyName = "Pressione";
		dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleRight;
		this.Pressione.DefaultCellStyle = dataGridViewCellStyle2;
		this.Pressione.HeaderText = "Pressione";
		this.Pressione.Name = "Pressione";
		this.Pressione.Resizable = System.Windows.Forms.DataGridViewTriState.True;
		this.Pressione.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
		this.Impulso.DataPropertyName = "Impulso";
		this.Impulso.HeaderText = "Durata Impulso";
		this.Impulso.Name = "Impulso";
		this.Impulsi.DataPropertyName = "Impulsi";
		this.Impulsi.HeaderText = "Numero Impulsi";
		this.Impulsi.Name = "Impulsi";
		this.Pompa.DataPropertyName = "Pompa";
		this.Pompa.HeaderText = "Pompa ON/OFF";
		this.Pompa.Name = "Pompa";
		this.Motore.DataPropertyName = "Motore";
		this.Motore.HeaderText = "Motore ON/OFF";
		this.Motore.Name = "Motore";
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(714, 539);
		base.Controls.Add(this.Chiudi);
		base.Controls.Add(this.Canali);
		base.Controls.Add(this.Salva);
		base.Controls.Add(this.Channel);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "FormChannels";
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Canali";
		base.Load += new System.EventHandler(FormChannels_Load);
		((System.ComponentModel.ISupportInitialize)this.Channel).EndInit();
		base.ResumeLayout(false);
	}
}
