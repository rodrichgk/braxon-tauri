using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Data.OleDb;
using System.Drawing;
using System.IO;
using System.Net;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ElectronikSistem;
using ElectronikSistem.WebServiceUpdateFirmWare;

namespace SC_F2_EVO;

public class SelectModelForm : Form
{
	public static byte TypeComponent;

	private UpdateFirmWare WebService;

	private bool DownTestCentralina = false;

	private string Errore = "";

	private string Nome_Modello;

	private string Nome_Produttore;

	private int Level = -1;

	private int ID_Produttore = -1;

	private int ID_Modello = -1;

	private ModelloForm Modello;

	private Progress SendFile;

	private DataTable Produttori;

	private DataTable Modelli;

	private Queue<char> BufferTx = new Queue<char>();

	private List<Manufacturer> Manufacturers = new List<Manufacturer>();

	private List<FRAME> Comando = new List<FRAME>();

	private string StringaConnessione;

	private OleDbConnection Connessione;

	private OleDbCommand Command;

	private OleDbDataAdapter adapter;

	private IContainer components = null;

	private Button Rimuovi;

	private Button Aggiungi;

	private TreeView Lista;

	private Button Modifica;

	private Button Annulla;

	private new Button Update;

	private Button UpdateFirmware;

	private Button Converti;

	private OpenFileDialog OpenFile;

	private Button UpLoad;

	public SelectModelForm(byte TypeComponent)
	{
		InitializeComponent();
		StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=ElectronicsData.accdb";
		Connessione = new OleDbConnection(StringaConnessione);
		Command = new OleDbCommand("", Connessione);
		adapter = new OleDbDataAdapter(Command);
		SelectModelForm.TypeComponent = TypeComponent;
		Fill();
		MemoryStream memoryStream = new MemoryStream();
		FormConfig formConfig = new FormConfig();
		WebService = new UpdateFirmWare();
		WebService.Url = MainMenuForm.URL + "UpdateFirmWare/UpdateFirmWare.asmx";
	}

	public object Deserialize(string jsonText, Type valueType)
	{
		JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
		return javaScriptSerializer.GetType().GetMethod("Deserialize").MakeGenericMethod(valueType)
			.Invoke(javaScriptSerializer, new object[1] { jsonText });
	}

	private void SelectModelForm_Load(object sender, EventArgs e)
	{
		if (!MainMenuForm.User)
		{
			int num = RectangleToScreen(base.ClientRectangle).Top - base.Top;
			base.Height = Update.Top + Update.Height + num + 12;
		}
	}

	private void Fill()
	{
		try
		{
			Lista.Nodes.Clear();
			Produttori = new DataTable();
			if (MainMenuForm.User)
			{
				Command.CommandText = "SELECT * FROM Produttori ORDER BY NOME";
			}
			else
			{
				Command.CommandText = "SELECT * FROM Produttori WHERE NOT NOME = '00' ORDER BY NOME";
			}
			adapter.Fill(Produttori);
			if (Produttori == null)
			{
				return;
			}
			foreach (DataRow row in Produttori.Rows)
			{
				TreeNode treeNode = Lista.Nodes.Add(row["ID"].ToString(), row["Nome"].ToString());
				Modelli = new DataTable();
				Command.CommandText = "SELECT * FROM Modelli WHERE ID_Produttore = " + row["ID"]?.ToString() + " AND Component = " + TypeComponent + " ORDER BY NOME";
				adapter.Fill(Modelli);
				foreach (DataRow row2 in Modelli.Rows)
				{
					treeNode.Nodes.Add(row2["ID"].ToString(), row2["Nome"].ToString());
				}
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void Seleziona_Click(object sender, EventArgs e)
	{
		if (Level == 0)
		{
			Modello = new ModelloForm(ID_Produttore, -1, Nome_Modello);
		}
		if (Level == 1)
		{
			Modello = new ModelloForm(ID_Produttore, ID_Modello, Nome_Modello);
		}
		if (Modello != null)
		{
			Modello.ShowDialog();
			if (Modello.DialogResult != DialogResult.Cancel)
			{
				Fill();
			}
			Modello.Dispose();
			Modello = null;
		}
		else
		{
			MessageBox.Show("Per aggiungere un modello, seleziona un costruttore.\r\n Per modificare un modello, prima deve essere selezionato.", "Attenzione", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private void Annulla_Click(object sender, EventArgs e)
	{
		base.DialogResult = DialogResult.Cancel;
		Close();
	}

	private void Aggiungi_Click(object sender, EventArgs e)
	{
		NewProduttoreForm newProduttoreForm = new NewProduttoreForm(select: false, "il produttore");
		try
		{
			if (Command.Connection.State != ConnectionState.Open)
			{
				Command.Connection.Open();
			}
			if (newProduttoreForm.ShowDialog() == DialogResult.OK)
			{
				Command.CommandText = "INSERT INTO Produttori ([Nome]) VALUES ('" + newProduttoreForm.Produttore.Text + "')";
				Command.ExecuteNonQuery();
				Fill();
			}
		}
		finally
		{
			Command.Connection.Close();
		}
		newProduttoreForm.Dispose();
		newProduttoreForm = null;
	}

	private void Rimuovi_Click(object sender, EventArgs e)
	{
		if (ID_Produttore == -1)
		{
			MessageBox.Show("Seleziona un costruttore.", "Attenzione", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
		else
		{
			if (MessageBox.Show("Rimuovere il costruttore vengono eliminati anche i modelli appartenenti a quest'ultimo.\r\n\r\nVuoi procedere?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No || MessageBox.Show("Sei sicuro?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No)
			{
				return;
			}
			try
			{
				if (Command.Connection.State != ConnectionState.Open)
				{
					Command.Connection.Open();
				}
				if (MessageBox.Show("Sicuro di voler eliminare il costruttore [" + Nome_Produttore + "]?", "Attenzione", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
				{
					Command.CommandText = "DELETE * FROM Produttori WHERE ID = " + ID_Produttore;
					Command.ExecuteNonQuery();
					Fill();
				}
			}
			finally
			{
				Command.Connection.Close();
			}
		}
	}

	private void Lista_AfterSelect(object sender, TreeViewEventArgs e)
	{
		Level = e.Node.Level;
		if (Level == 0)
		{
			ID_Produttore = int.Parse(e.Node.Name);
			Nome_Produttore = e.Node.Text;
			ID_Modello = -1;
			Nome_Modello = "";
		}
		if (Level == 1)
		{
			if (ID_Produttore == 0)
			{
				ID_Produttore = int.Parse(e.Node.Parent.Name);
				Nome_Produttore = e.Node.Parent.Text;
			}
			ID_Modello = int.Parse(e.Node.Name);
			Nome_Modello = e.Node.Text;
		}
	}

	private void Lista_MouseDoubleClick(object sender, MouseEventArgs e)
	{
		if (Level == 1)
		{
			MainMenuForm.ID_Produttore = ID_Produttore;
			MainMenuForm.ID_Modello = ID_Modello;
			MainMenuForm.NomeModello = Nome_Modello;
			base.DialogResult = DialogResult.OK;
			Close();
		}
		else
		{
			MessageBox.Show("Select Model.", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private void UpLoad_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Vuoi aggiornare in database che e in rete?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No && MessageBox.Show("Sei sicuro di fare questa operazione?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.No)
		{
			SendFile = new Progress();
			SendFile.Status.Minimum = 0;
			SendFile.Status.Maximum = (int)new FileInfo("ElectronicsData.accdb").Length;
			FTP.Upload("ElectronicsData.accdb", MainMenuForm.Domain + "App_Data/SC%20F2-EVO/ElectronicsData.accdb", MainMenuForm.Login, MainMenuForm.Password, UploadProgress, UploadCompleted);
			SendFile.Show();
		}
	}

	private void Update_Click(object sender, EventArgs e)
	{
		SendFile = new Progress();
		SendFile.Status.Minimum = 0;
		if (MessageBox.Show("Are you sure you do this operaton?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) == DialogResult.No)
		{
			return;
		}
		try
		{
			FormConfig formConfig = new FormConfig();
			if (WebService.UpdateElectronicBench(formConfig.UserName.Text, formConfig.License.Text))
			{
				File.Delete("E-BackUp.accdb");
				File.Move("ElectronicsData.accdb", "E-BackUp.accdb");
				SendFile.Status.Maximum = (int)FTP.GetSize(MainMenuForm.Domain + "App_Data/SC%20F2-EVO/ElectronicsData.accdb", MainMenuForm.Login, MainMenuForm.Password);
				FTP.Download("ElectronicsData.accdb", MainMenuForm.Domain + "App_Data/SC%20F2-EVO/ElectronicsData.accdb", MainMenuForm.Login, MainMenuForm.Password, DownloadProgress, DownloadCompleted);
				SendFile.Show();
			}
			else
			{
				MessageBox.Show("License expired!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			}
			formConfig.Close();
			formConfig.Dispose();
			formConfig = null;
		}
		catch
		{
			MessageBox.Show("An error has occurred, the database will be restored", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
			if (File.Exists("ElectronicsData.accdb"))
			{
				File.Delete("ElectronicsData.accdb");
			}
			File.Copy("E-BackUp.accdb", "ElectronicsData.accdb");
			Fill();
			SendFile = null;
		}
	}

	private void UpdateFirmware_Click(object sender, EventArgs e)
	{
		if (MessageBox.Show("Do you want to update the firmware?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.Yes || MessageBox.Show("Proceed with the operation?", "Warning", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button2) != DialogResult.Yes || !Sistem.IsApplicationInstalled("Update firmware", out var _))
		{
			return;
		}
		if (MainMenuForm.COM[0].PortName == "COM100" && MainMenuForm.COM[1].PortName == "COM101")
		{
			MessageBox.Show("Board not found.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return;
		}
		if (MainMenuForm.TestElectronic == -1 && MainMenuForm.TestHydraulic == -1)
		{
			MessageBox.Show("Board not found.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return;
		}
		if (MainMenuForm.TestElectronic == -1 && MainMenuForm.TestHydraulic > -1)
		{
			if (MainMenuForm.TestHydraulic == 0)
			{
				MainMenuForm.TestElectronic = 1;
			}
			if (MainMenuForm.TestHydraulic == 1)
			{
				MainMenuForm.TestElectronic = 0;
			}
		}
		if (MainMenuForm.COM[MainMenuForm.TestElectronic].IsOpen)
		{
			MainMenuForm.COM[MainMenuForm.TestElectronic].Close();
		}
		string portName = MainMenuForm.COM[MainMenuForm.TestElectronic].PortName;
		if (portName == "COM100" || portName == "COM101")
		{
			MessageBox.Show("Board not found.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			return;
		}
		string fileName = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + "\\GRMtronics\\Update firmware\\GRMtronics.exe";
		Sistem.StartProcess(fileName, "-Test Centralina -" + MainMenuForm.Versione + " -" + portName);
		if (MainMenuForm.TestElectronic > -1 && !MainMenuForm.COM[MainMenuForm.TestElectronic].IsOpen)
		{
			MainMenuForm.COM[MainMenuForm.TestElectronic].Open();
		}
	}

	private void Converti_Click(object sender, EventArgs e)
	{
		DateTime now = DateTime.Now;
		SendFile = new Progress();
		SendFile.Status.Maximum = (int)FTP.GetSize(MainMenuForm.Domain + "App_Data/TestCentralina/TestCentralina.accdb", MainMenuForm.Login, MainMenuForm.Password);
		FTP.Download("TestCentralina.accdb", MainMenuForm.Domain + "App_Data/TestCentralina/TestCentralina.accdb", MainMenuForm.Login, MainMenuForm.Password, DownloadProgress, DownloadCompleted1);
		SendFile.Show();
		while (DateTime.Now.Subtract(now).TotalSeconds < 30.0 && !DownTestCentralina)
		{
			Application.DoEvents();
		}
		if (DownTestCentralina)
		{
			int num = 0;
			string text = "";
			string connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=TestCentralina.accdb";
			OleDbConnection connection = new OleDbConnection(connectionString);
			OleDbCommand oleDbCommand = new OleDbCommand("", connection);
			OleDbDataAdapter oleDbDataAdapter = new OleDbDataAdapter(oleDbCommand);
			DataTable dataTable = new DataTable();
			DataTable dataTable2 = new DataTable();
			DataTable dataTable3 = new DataTable();
			DataTable dataTable4 = new DataTable();
			DataRow dataRow = null;
			Command.CommandText = "SELECT ID, Nome FROM Produttori";
			adapter.Fill(dataTable);
			oleDbCommand.CommandText = "SELECT Count(*) AS N, NStringhe, [Produttore], [Nome] FROM(\r\n                                                                             SELECT (SELECT Count(*) FROM Stringhe WHERE ID_Modello = Modelli.ID) AS NStringhe, Modelli.[ID_Produttore], Produttori.[Nome] AS Produttore, Modelli.[Nome], Modelli.[SpeedCAN], Modelli.[Type], Modelli.[Signal], Modelli.[Resistor1], Modelli.[Resistor2], Modelli.[Code], Modelli.[Coefficient], Modelli.[BreakSpeed], Modelli.[Pausa], Modelli.[Component], Modelli.[WaitComunication], Modelli.[Enable], Modelli.[Spike]\r\n                                                                             FROM Produttori INNER JOIN Modelli ON Produttori.ID = Modelli.ID_Produttore\r\n                                                                             )\r\n                                           GROUP BY NStringhe, [Produttore], [Nome], [SpeedCAN], [Type], [Signal], [Resistor1], [Resistor2], [Code], [Coefficient], [BreakSpeed], [Pausa], [Component], [WaitComunication], [Enable], [Spike]\r\n                                           HAVING Component = 0\r\n                                           ORDER BY [Nome];";
			oleDbDataAdapter.Fill(dataTable2);
			SendFile.Status.Value = 0;
			SendFile.Status.Maximum = dataTable2.Rows.Count;
			foreach (DataRow row in dataTable2.Rows)
			{
				oleDbCommand.CommandText = "SELECT Produttori.[Nome] AS Produttore, Modelli.* FROM Produttori INNER JOIN Modelli ON Produttori.ID = Modelli.ID_Produttore WHERE Modelli.[Nome] = '" + row["Nome"]?.ToString() + "'";
				dataTable4.Clear();
				oleDbDataAdapter.Fill(dataTable4);
				dataRow = dataTable4.Rows[0];
				string message;
				if (dataTable.Select("Nome = '" + dataRow["Produttore"]?.ToString() + "'").Length == 0)
				{
					text = "INSERT INTO Produttori([Nome]) VALUES ('" + dataRow["Produttore"]?.ToString() + "')";
					if (!ExecuteQuery(text, out message))
					{
						throw new Exception(message);
					}
					dataTable.Clear();
					Command.CommandText = "SELECT ID, Nome FROM Produttori";
					adapter.Fill(dataTable);
				}
				num = (int)dataTable.Select("Nome = '" + dataRow["Produttore"]?.ToString() + "'")[0]["ID"];
				Command.CommandText = "SELECT ID, ID_Produttore, Nome FROM Modelli WHERE Nome = '" + row["Nome"]?.ToString() + "'";
				dataTable3.Clear();
				adapter.Fill(dataTable3);
				if (dataTable3.Rows.Count > 0)
				{
					text = "UPDATE Modelli SET ";
					text = text + "[ID_Produttore] = " + num + ", ";
					text = text + "[Nome] = '" + dataRow["Nome"].ToString() + "', ";
					text = text + "SpeedCAN = " + dataRow["SpeedCAN"]?.ToString() + ", ";
					text = text + "Type = " + dataRow["Type"]?.ToString() + ", ";
					text = text + "Signal = " + dataRow["Signal"]?.ToString() + ", ";
					text = text + "Wheel1Res1 = " + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel1Res2 = " + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel2Res1 = " + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel2Res2 = " + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel3Res1 = " + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel3Res2 = " + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel4Res1 = " + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + "Wheel4Res2 = " + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + "Code = " + ((dataRow["Code"] != DBNull.Value) ? dataRow["Code"] : ((object)2000))?.ToString() + ", ";
					text = text + "Coefficient = " + ((dataRow["Coefficient"] != DBNull.Value) ? dataRow["Coefficient"].ToString().Replace(',', '.') : 0.16.ToString().Replace(',', '.')) + ", ";
					text += "DeltaSpeed = 1.0, ";
					text = text + "BreakSpeed = " + ((dataRow["BreakSpeed"] != DBNull.Value) ? dataRow["BreakSpeed"].ToString().Replace(',', '.') : 0.7.ToString().Replace(',', '.')) + ", ";
					text = text + "Pausa = " + ((dataRow["Pausa"] != DBNull.Value) ? dataRow["Pausa"] : ((object)100))?.ToString() + ", ";
					text = text + "Component = " + dataRow["Component"]?.ToString() + ", ";
					text = text + "WaitComunication = " + dataRow["WaitComunication"]?.ToString() + ", ";
					text = text + "[Enable] = " + dataRow["Enable"]?.ToString() + ", ";
					text = text + "[Spike] = " + dataRow["Spike"]?.ToString() + ", ";
					text += "Speed1 = 0.0, ";
					text += "Speed2 = 0.0, ";
					text += "Speed3 = 0.0, ";
					text += "Speed4 = 0.0, ";
					text += "Alfa1 = 1.0, ";
					text += "Alfa2 = 1.0, ";
					text += "Alfa3 = 1.0, ";
					text += "Alfa4 = 1.0";
					text = text + " WHERE Nome = '" + dataRow["Nome"]?.ToString() + "'";
				}
				else
				{
					text = "INSERT INTO Modelli ([ID_Produttore], [Nome], [SpeedCAN], [Type], [Signal], [Wheel1Res1], [Wheel1Res2], [Wheel2Res1], [Wheel2Res2], [Wheel3Res1], [Wheel3Res2], [Wheel4Res1], [Wheel4Res2], [Code], [Coefficient], [DeltaSpeed], [BreakSpeed], [Pausa], [Component], [WaitComunication], [Enable], [Spike], [Speed1], [Speed2], [Speed3], [Speed4], [Alfa1], [Alfa2], [Alfa3], [Alfa4]) VALUES (";
					text = text + num + ", ";
					text = text + "'" + dataRow["Nome"]?.ToString() + "', ";
					text = text + dataRow["SpeedCAN"]?.ToString() + ", ";
					text = text + dataRow["Type"]?.ToString() + ", ";
					text = text + dataRow["Signal"]?.ToString() + ", ";
					text = text + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor1"] != DBNull.Value) ? dataRow["Resistor1"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Resistor2"] != DBNull.Value) ? dataRow["Resistor2"] : ((object)1500))?.ToString() + ", ";
					text = text + ((dataRow["Code"] != DBNull.Value) ? dataRow["Code"] : ((object)2000))?.ToString() + ", ";
					text = text + ((dataRow["Coefficient"] != DBNull.Value) ? dataRow["Coefficient"].ToString().Replace(',', '.') : 0.16.ToString().Replace(',', '.')) + ", ";
					text += "1.0, ";
					text = text + ((dataRow["BreakSpeed"] != DBNull.Value) ? dataRow["BreakSpeed"].ToString().Replace(',', '.') : 0.7.ToString().Replace(',', '.')) + ", ";
					text = text + ((dataRow["Pausa"] != DBNull.Value) ? dataRow["Pausa"] : ((object)100))?.ToString() + ", ";
					text = text + dataRow["Component"]?.ToString() + ", ";
					text = text + dataRow["WaitComunication"]?.ToString() + ", ";
					text = text + dataRow["Enable"]?.ToString() + ", ";
					text = text + dataRow["Spike"]?.ToString() + ", ";
					text += "0.0, ";
					text += "0.0, ";
					text += "0.0, ";
					text += "0.0, ";
					text += "1.0, ";
					text += "1.0, ";
					text += "1.0, ";
					text += "1.0";
					text += ")";
				}
				if (!ExecuteQuery(text, out message))
				{
					throw new Exception(message);
				}
				if (dataTable3.Rows.Count > 1)
				{
					for (int i = 1; i < dataTable3.Rows.Count; i++)
					{
						text = "DELETE FROM Modelli WHERE ID = " + dataTable3.Rows[i]["ID"];
					}
				}
				if ((int)row["NStringhe"] > 0)
				{
				}
				SendFile.Status.Value++;
			}
		}
		else
		{
			MessageBox.Show("File TestCentralina.accdb non scaricato!!!", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
		SendFile.Close();
		SendFile.Dispose();
		SendFile = null;
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
			MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
			message = ex.Message;
			return false;
		}
		finally
		{
			Command.Connection.Close();
		}
	}

	private void UploadProgress(object sender, UploadProgressChangedEventArgs e)
	{
		SendFile.Status.Value = (int)e.BytesSent;
		Application.DoEvents();
	}

	private void UploadCompleted(object sender, UploadFileCompletedEventArgs e)
	{
		SendFile.Close();
		SendFile = null;
	}

	private void DownloadProgress(object sender, DownloadProgressChangedEventArgs e)
	{
		SendFile.Status.Value = (int)e.BytesReceived;
		Application.DoEvents();
	}

	private void DownloadCompleted(object sender, AsyncCompletedEventArgs e)
	{
		SendFile.Close();
		SendFile = null;
		Prmission.FileSetRule("ElectronicsData.accdb");
		Fill();
	}

	private void DownloadCompleted1(object sender, AsyncCompletedEventArgs e)
	{
		Prmission.FileSetRule("TestCentralina.accdb");
		DownTestCentralina = true;
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
		this.Rimuovi = new System.Windows.Forms.Button();
		this.Aggiungi = new System.Windows.Forms.Button();
		this.Lista = new System.Windows.Forms.TreeView();
		this.Modifica = new System.Windows.Forms.Button();
		this.Annulla = new System.Windows.Forms.Button();
		this.Update = new System.Windows.Forms.Button();
		this.UpdateFirmware = new System.Windows.Forms.Button();
		this.Converti = new System.Windows.Forms.Button();
		this.OpenFile = new System.Windows.Forms.OpenFileDialog();
		this.UpLoad = new System.Windows.Forms.Button();
		base.SuspendLayout();
		this.Rimuovi.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Rimuovi.Location = new System.Drawing.Point(131, 360);
		this.Rimuovi.Name = "Rimuovi";
		this.Rimuovi.Size = new System.Drawing.Size(204, 30);
		this.Rimuovi.TabIndex = 9;
		this.Rimuovi.Text = "Rimuovi costruttore";
		this.Rimuovi.UseVisualStyleBackColor = true;
		this.Rimuovi.Click += new System.EventHandler(Rimuovi_Click);
		this.Aggiungi.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Aggiungi.Location = new System.Drawing.Point(131, 323);
		this.Aggiungi.Name = "Aggiungi";
		this.Aggiungi.Size = new System.Drawing.Size(204, 31);
		this.Aggiungi.TabIndex = 8;
		this.Aggiungi.Text = "Aggiungi costruttore";
		this.Aggiungi.UseVisualStyleBackColor = true;
		this.Aggiungi.Click += new System.EventHandler(Aggiungi_Click);
		this.Lista.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Lista.Location = new System.Drawing.Point(12, 12);
		this.Lista.Name = "Lista";
		this.Lista.Size = new System.Drawing.Size(323, 214);
		this.Lista.TabIndex = 7;
		this.Lista.AfterSelect += new System.Windows.Forms.TreeViewEventHandler(Lista_AfterSelect);
		this.Lista.MouseDoubleClick += new System.Windows.Forms.MouseEventHandler(Lista_MouseDoubleClick);
		this.Modifica.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Modifica.Location = new System.Drawing.Point(12, 323);
		this.Modifica.Name = "Modifica";
		this.Modifica.Size = new System.Drawing.Size(90, 31);
		this.Modifica.TabIndex = 6;
		this.Modifica.Text = "Modifica";
		this.Modifica.UseVisualStyleBackColor = true;
		this.Modifica.Click += new System.EventHandler(Seleziona_Click);
		this.Annulla.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Annulla.Location = new System.Drawing.Point(12, 360);
		this.Annulla.Name = "Annulla";
		this.Annulla.Size = new System.Drawing.Size(90, 31);
		this.Annulla.TabIndex = 10;
		this.Annulla.Text = "Annulla";
		this.Annulla.UseVisualStyleBackColor = true;
		this.Annulla.Click += new System.EventHandler(Annulla_Click);
		this.Update.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Update.Location = new System.Drawing.Point(12, 234);
		this.Update.Name = "Update";
		this.Update.Size = new System.Drawing.Size(154, 31);
		this.Update.TabIndex = 11;
		this.Update.Text = "Update Models";
		this.Update.UseVisualStyleBackColor = true;
		this.Update.Click += new System.EventHandler(Update_Click);
		this.UpdateFirmware.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.UpdateFirmware.Location = new System.Drawing.Point(172, 234);
		this.UpdateFirmware.Name = "UpdateFirmware";
		this.UpdateFirmware.Size = new System.Drawing.Size(163, 31);
		this.UpdateFirmware.TabIndex = 14;
		this.UpdateFirmware.Text = "Update Firmware";
		this.UpdateFirmware.UseVisualStyleBackColor = true;
		this.UpdateFirmware.Click += new System.EventHandler(UpdateFirmware_Click);
		this.Converti.Font = new System.Drawing.Font("Microsoft Sans Serif", 11.25f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.Converti.Location = new System.Drawing.Point(131, 397);
		this.Converti.Name = "Converti";
		this.Converti.Size = new System.Drawing.Size(204, 31);
		this.Converti.TabIndex = 15;
		this.Converti.Text = "Copia da TestCentralina";
		this.Converti.UseVisualStyleBackColor = true;
		this.Converti.Click += new System.EventHandler(Converti_Click);
		this.OpenFile.DefaultExt = "accdb";
		this.UpLoad.Font = new System.Drawing.Font("Microsoft Sans Serif", 12f, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic, System.Drawing.GraphicsUnit.Point, 0);
		this.UpLoad.Location = new System.Drawing.Point(12, 397);
		this.UpLoad.Name = "UpLoad";
		this.UpLoad.Size = new System.Drawing.Size(90, 31);
		this.UpLoad.TabIndex = 16;
		this.UpLoad.Text = "Pubblica";
		this.UpLoad.UseVisualStyleBackColor = true;
		this.UpLoad.Click += new System.EventHandler(UpLoad_Click);
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(347, 440);
		base.Controls.Add(this.UpLoad);
		base.Controls.Add(this.Converti);
		base.Controls.Add(this.UpdateFirmware);
		base.Controls.Add(this.Update);
		base.Controls.Add(this.Annulla);
		base.Controls.Add(this.Rimuovi);
		base.Controls.Add(this.Aggiungi);
		base.Controls.Add(this.Lista);
		base.Controls.Add(this.Modifica);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "SelectModelForm";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Select Model";
		base.Load += new System.EventHandler(SelectModelForm_Load);
		base.ResumeLayout(false);
	}
}
