using System;
using System.Data;
using System.Data.OleDb;
using System.Diagnostics;
using System.Windows.Forms;

namespace ElectronikSistem;

public class ConnessioneAccess
{
	private static bool InTransazione = false;

	public static string StringaConnessione = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source={0}.accdb";

	public static OleDbConnection Connessione = new OleDbConnection(StringaConnessione);

	public static OleDbTransaction Transazione = null;

	public ConnessioneAccess(string StringaConnessione)
	{
		ConnessioneAccess.StringaConnessione = StringaConnessione;
		Connessione = new OleDbConnection(StringaConnessione);
	}

	public static bool ApriConnessione(string db)
	{
		try
		{
			if (Connessione.State != ConnectionState.Open)
			{
				Connessione.ConnectionString = string.Format(StringaConnessione, db);
				Connessione.Open();
			}
			return true;
		}
		catch (Exception)
		{
			return false;
		}
	}

	public static bool ChiudiConnessione()
	{
		try
		{
			if (Connessione.State != ConnectionState.Closed)
			{
				Connessione.Close();
			}
			return true;
		}
		catch
		{
			return false;
		}
	}

	public static void TransazioneBegin()
	{
		Transazione = Connessione.BeginTransaction();
		InTransazione = true;
	}

	public static void TransazioneCommit()
	{
		Transazione.Commit();
		InTransazione = false;
	}

	public static void TransazioneRollback()
	{
		if (InTransazione)
		{
			Transazione.Rollback();
			InTransazione = false;
		}
	}

	public static DataTable FillTable(string strSQL, OleDbParameter[] Parameters = null, DataTable table = null)
	{
		byte b = 0;
		string text = "";
		DateTime now = DateTime.Now;
		OleDbDataAdapter oleDbDataAdapter = null;
		StackTrace stackTrace = new StackTrace();
		StackFrame frame = stackTrace.GetFrame(2);
		text = text + frame.GetMethod().Name + "/";
		frame = stackTrace.GetFrame(1);
		text = text + frame.GetMethod().Name + "\r\n\r\n";
		oleDbDataAdapter = new OleDbDataAdapter(strSQL, Connessione);
		if (Parameters != null)
		{
			OleDbParameter[] array = new OleDbParameter[Parameters.Length];
			for (int i = 0; i < Parameters.Length; i++)
			{
				array[i] = new OleDbParameter(Parameters[i].ParameterName, Parameters[i].DbType);
				array[i].Value = Parameters[i].Value;
			}
			oleDbDataAdapter.SelectCommand.Parameters.AddRange(array);
		}
		oleDbDataAdapter.SelectCommand.CommandTimeout = 3;
		if (table == null)
		{
			table = new DataTable();
		}
		while (true)
		{
			try
			{
				if (Connessione.State == ConnectionState.Closed)
				{
					Connessione.Open();
				}
				oleDbDataAdapter.Fill(table);
				double totalSeconds = DateTime.Now.Subtract(now).TotalSeconds;
				if (totalSeconds > 2.0)
				{
					totalSeconds = 0.0;
				}
				return table;
			}
			catch (OleDbException ex)
			{
				if (b++ < 3)
				{
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			catch (InvalidOperationException ex2)
			{
				if (b++ < 3)
				{
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex2.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			catch (Exception ex3)
			{
				MessageBox.Show(text + "Error: " + ex3.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			finally
			{
				oleDbDataAdapter.SelectCommand.Parameters.Clear();
				Connessione.Close();
			}
		}
	}

	public static object GetValue(string strSQL)
	{
		byte b = 0;
		string text = "";
		StackTrace stackTrace = new StackTrace();
		StackFrame frame = stackTrace.GetFrame(2);
		text = text + frame.GetMethod().Name + "/";
		frame = stackTrace.GetFrame(1);
		text = text + frame.GetMethod().Name + "\r\n\r\n";
		OleDbCommand oleDbCommand = new OleDbCommand(strSQL, Connessione);
		while (true)
		{
			try
			{
				if (Connessione.State == ConnectionState.Closed)
				{
					Connessione.Open();
				}
				return oleDbCommand.ExecuteScalar();
			}
			catch (OleDbException ex)
			{
				if (b++ < 3)
				{
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			catch (InvalidOperationException ex2)
			{
				if (b++ < 3)
				{
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex2.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			catch (Exception ex3)
			{
				MessageBox.Show(text + "Error: " + ex3.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return null;
			}
			finally
			{
				Connessione.Close();
			}
		}
	}

	public static bool Execute(string strSQL)
	{
		byte b = 0;
		string text = "";
		StackTrace stackTrace = new StackTrace();
		StackFrame frame = stackTrace.GetFrame(2);
		text = text + frame.GetMethod().Name + "/";
		frame = stackTrace.GetFrame(1);
		text = text + frame.GetMethod().Name + "\r\n\r\n";
		OleDbCommand oleDbCommand = new OleDbCommand(strSQL, Connessione);
		while (true)
		{
			try
			{
				if (Connessione.State == ConnectionState.Closed)
				{
					Connessione.Open();
				}
				TransazioneBegin();
				oleDbCommand.Transaction = Transazione;
				oleDbCommand.ExecuteNonQuery();
				TransazioneCommit();
				return true;
			}
			catch (OleDbException ex)
			{
				if (b++ < 3)
				{
					TransazioneRollback();
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return false;
			}
			catch (InvalidOperationException ex2)
			{
				if (b++ < 3)
				{
					Connessione.Close();
					Sistem.Delay(500.0);
					continue;
				}
				MessageBox.Show(text + "Error: " + ex2.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return false;
			}
			catch (Exception ex3)
			{
				TransazioneRollback();
				MessageBox.Show(text + "Error: " + ex3.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
				return false;
			}
			finally
			{
				Connessione.Close();
			}
		}
	}
}
