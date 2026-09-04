using System;
using System.Data;
using System.Data.OleDb;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using ElectronikSistem.ServerDb;

namespace ElectronikSistem;

public class DataService
{
	public int TimeOut = 3;

	public string DataBase;

	private DataTable _getTable;

	private object _value;

	public OleDbConnection Connessione;

	public OleDbCommand SelectCommand;

	public OleDbCommand Command;

	private OleDbDataAdapter Adapter;

	private JavaScriptSerializer Serializer = new JavaScriptSerializer();

	private ElectronikSistem.ServerDb.ServerDb DataBaseAdapter;

	private CookieContainer CK;

	private bool Wait = false;

	public bool Error = false;

	public DataService(string url, string applicationData, string dataBase)
	{
		DataBase = dataBase;
		SelectCommand = new OleDbCommand("", Connessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter(SelectCommand);
		CK = new CookieContainer();
		DataBaseAdapter = new ElectronikSistem.ServerDb.ServerDb();
		DataBaseAdapter.CookieContainer = CK;
		DataBaseAdapter.Url = url;
		DataBaseAdapter.ServerDbConnection(applicationData, dataBase);
	}

	public DataService(string dataBase)
	{
		Connessione = new OleDbConnection($"Provider=Microsoft.ACE.OLEDB.12.0;Data Source={dataBase}.accdb");
		SelectCommand = new OleDbCommand("", Connessione);
		Command = new OleDbCommand("", Connessione);
		Adapter = new OleDbDataAdapter(SelectCommand);
	}

	public bool LogIn(string UserName, string SerialNumber, string Device, string Code)
	{
		DataBaseAdapter.LOGINValue = new LOGIN();
		DataBaseAdapter.LOGINValue.UserName = UserName;
		DataBaseAdapter.LOGINValue.SerialNumber = SerialNumber;
		DataBaseAdapter.LOGINValue.Device = Device;
		DataBaseAdapter.LOGINValue.Code = Code;
		return DataBaseAdapter.LogIn();
	}

	private async Task<DataTable> ReadTableAsync()
	{
		return await Task.Run(delegate
		{
			if (Connessione != null)
			{
				try
				{
					DataTable dataTable = new DataTable();
					Adapter.Fill(dataTable);
					return dataTable;
				}
				catch
				{
					return new DataTable();
				}
			}
			string parameters = Serializer.Serialize(Adapter.SelectCommand.Parameters);
			TableResult tableResult = DataBaseAdapter.Table(SelectCommand.CommandText, parameters);
			return tableResult.dataset.Tables[0];
		});
	}

	private async void _ReadTable()
	{
		_getTable = await ReadTableAsync();
		Wait = false;
	}

	public void Fill(DataTable table)
	{
		DateTime now = DateTime.Now;
		Error = true;
		Wait = true;
		_getTable = null;
		_ReadTable();
		while (Wait && DateTime.Now.Subtract(now).TotalSeconds < (double)TimeOut)
		{
			Sistem.Delay(10.0);
		}
		if (Wait)
		{
			return;
		}
		Error = Wait;
		if (table == null)
		{
			throw new Exception("Table is null!!!");
		}
		if (_getTable == null)
		{
			return;
		}
		if (table.Columns.Count == 0)
		{
			foreach (DataColumn column in _getTable.Columns)
			{
				table.Columns.Add(column.ColumnName, column.DataType);
			}
		}
		foreach (DataRow row in _getTable.Rows)
		{
			DataRow dataRow2 = table.NewRow();
			foreach (DataColumn column2 in _getTable.Columns)
			{
				if (table.Columns.Contains(column2.ColumnName))
				{
					dataRow2[column2.ColumnName] = row[column2.ColumnName];
					continue;
				}
				throw new Exception("Column in table not found!!!");
			}
			table.Rows.Add(dataRow2);
		}
	}

	private async Task<object> GetValueAsync()
	{
		return await Task.Run(delegate
		{
			if (Connessione == null)
			{
				try
				{
					return DataBaseAdapter.GetValue(Command.CommandText);
				}
				catch
				{
					return (object)null;
				}
			}
			byte b = 0;
			if (Command.Connection.State == ConnectionState.Closed)
			{
				Command.Connection.Open();
			}
			do
			{
				Sistem.Delay(5.0);
			}
			while (b++ < 50 && Command.Connection.State != ConnectionState.Open);
			if (Command.Connection.State == ConnectionState.Open)
			{
				object result = Command.ExecuteScalar();
				Command.Connection.Close();
				return result;
			}
			return (object)null;
		});
	}

	private async void _ReadValue()
	{
		_value = await GetValueAsync();
		Wait = false;
	}

	public object ExecuteScalar()
	{
		DateTime now = DateTime.Now;
		Wait = true;
		_value = null;
		_ReadValue();
		while (Wait && DateTime.Now.Subtract(now).TotalSeconds < (double)TimeOut)
		{
			Sistem.Delay(10.0);
		}
		return _value;
	}

	public void ExecuteNonQuery()
	{
		if (Connessione == null)
		{
			string text = DataBaseAdapter.ExecuteNonQuery(Command.CommandText);
			if (text != "Successfull")
			{
				throw new Exception(text);
			}
		}
		else
		{
			ExecuteQuery();
		}
	}

	private string ExecuteQuery()
	{
		string text = null;
		OleDbTransaction oleDbTransaction = null;
		try
		{
			Command.Connection.Open();
			oleDbTransaction = Command.Connection.BeginTransaction();
			Command.Transaction = oleDbTransaction;
			Command.ExecuteNonQuery();
			oleDbTransaction.Commit();
		}
		catch (Exception ex)
		{
			oleDbTransaction.Rollback();
			text = "Error: " + ex.Message;
			throw new Exception(text);
		}
		finally
		{
			Command.Connection.Close();
		}
		return text;
	}
}
