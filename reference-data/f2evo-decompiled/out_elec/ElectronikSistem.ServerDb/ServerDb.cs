using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Threading;
using System.Web.Services;
using System.Web.Services.Description;
using System.Web.Services.Protocols;
using System.Xml.Serialization;
using ElectronikSistem.Properties;

namespace ElectronikSistem.ServerDb;

[GeneratedCode("System.Web.Services", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
[WebServiceBinding(Name = "ServerDbSoap", Namespace = "http://tempuri.org/")]
public class ServerDb : SoapHttpClientProtocol
{
	private LOGIN lOGINValueField;

	private SendOrPostCallback LogInOperationCompleted;

	private SendOrPostCallback ServerDbConnectionOperationCompleted;

	private SendOrPostCallback TableOperationCompleted;

	private SendOrPostCallback GetValueOperationCompleted;

	private SendOrPostCallback ExecuteNonQueryOperationCompleted;

	private bool useDefaultCredentialsSetExplicitly;

	public LOGIN LOGINValue
	{
		get
		{
			return lOGINValueField;
		}
		set
		{
			lOGINValueField = value;
		}
	}

	public new string Url
	{
		get
		{
			return base.Url;
		}
		set
		{
			if (IsLocalFileSystemWebService(base.Url) && !useDefaultCredentialsSetExplicitly && !IsLocalFileSystemWebService(value))
			{
				base.UseDefaultCredentials = false;
			}
			base.Url = value;
		}
	}

	public new bool UseDefaultCredentials
	{
		get
		{
			return base.UseDefaultCredentials;
		}
		set
		{
			base.UseDefaultCredentials = value;
			useDefaultCredentialsSetExplicitly = true;
		}
	}

	public event LogInCompletedEventHandler LogInCompleted;

	public event ServerDbConnectionCompletedEventHandler ServerDbConnectionCompleted;

	public event TableCompletedEventHandler TableCompleted;

	public event GetValueCompletedEventHandler GetValueCompleted;

	public event ExecuteNonQueryCompletedEventHandler ExecuteNonQueryCompleted;

	public ServerDb()
	{
		Url = Settings.Default.ElectronikSistem_ServerDb_ServerDb;
		if (IsLocalFileSystemWebService(Url))
		{
			UseDefaultCredentials = true;
			useDefaultCredentialsSetExplicitly = false;
		}
		else
		{
			useDefaultCredentialsSetExplicitly = true;
		}
	}

	[SoapHeader("LOGINValue")]
	[SoapDocumentMethod("http://tempuri.org/LogIn", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public bool LogIn()
	{
		object[] array = Invoke("LogIn", new object[0]);
		return (bool)array[0];
	}

	public void LogInAsync()
	{
		LogInAsync(null);
	}

	public void LogInAsync(object userState)
	{
		if (LogInOperationCompleted == null)
		{
			LogInOperationCompleted = OnLogInOperationCompleted;
		}
		InvokeAsync("LogIn", new object[0], LogInOperationCompleted, userState);
	}

	private void OnLogInOperationCompleted(object arg)
	{
		if (this.LogInCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.LogInCompleted(this, new LogInCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/ServerDbConnection", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public void ServerDbConnection(string applicationData, string database)
	{
		Invoke("ServerDbConnection", new object[2] { applicationData, database });
	}

	public void ServerDbConnectionAsync(string applicationData, string database)
	{
		ServerDbConnectionAsync(applicationData, database, null);
	}

	public void ServerDbConnectionAsync(string applicationData, string database, object userState)
	{
		if (ServerDbConnectionOperationCompleted == null)
		{
			ServerDbConnectionOperationCompleted = OnServerDbConnectionOperationCompleted;
		}
		InvokeAsync("ServerDbConnection", new object[2] { applicationData, database }, ServerDbConnectionOperationCompleted, userState);
	}

	private void OnServerDbConnectionOperationCompleted(object arg)
	{
		if (this.ServerDbConnectionCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.ServerDbConnectionCompleted(this, new AsyncCompletedEventArgs(e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/Table", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	[return: XmlElement(IsNullable = true)]
	public TableResult Table(string query, string parameters)
	{
		object[] array = Invoke("Table", new object[2] { query, parameters });
		return (TableResult)array[0];
	}

	public void TableAsync(string query, string parameters)
	{
		TableAsync(query, parameters, null);
	}

	public void TableAsync(string query, string parameters, object userState)
	{
		if (TableOperationCompleted == null)
		{
			TableOperationCompleted = OnTableOperationCompleted;
		}
		InvokeAsync("Table", new object[2] { query, parameters }, TableOperationCompleted, userState);
	}

	private void OnTableOperationCompleted(object arg)
	{
		if (this.TableCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.TableCompleted(this, new TableCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/GetValue", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	[return: XmlElement(IsNullable = true)]
	public object GetValue(string query)
	{
		object[] array = Invoke("GetValue", new object[1] { query });
		return array[0];
	}

	public void GetValueAsync(string query)
	{
		GetValueAsync(query, null);
	}

	public void GetValueAsync(string query, object userState)
	{
		if (GetValueOperationCompleted == null)
		{
			GetValueOperationCompleted = OnGetValueOperationCompleted;
		}
		InvokeAsync("GetValue", new object[1] { query }, GetValueOperationCompleted, userState);
	}

	private void OnGetValueOperationCompleted(object arg)
	{
		if (this.GetValueCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.GetValueCompleted(this, new GetValueCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/ExecuteNonQuery", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	[return: XmlElement(IsNullable = true)]
	public string ExecuteNonQuery(string query)
	{
		object[] array = Invoke("ExecuteNonQuery", new object[1] { query });
		return (string)array[0];
	}

	public void ExecuteNonQueryAsync(string query)
	{
		ExecuteNonQueryAsync(query, null);
	}

	public void ExecuteNonQueryAsync(string query, object userState)
	{
		if (ExecuteNonQueryOperationCompleted == null)
		{
			ExecuteNonQueryOperationCompleted = OnExecuteNonQueryOperationCompleted;
		}
		InvokeAsync("ExecuteNonQuery", new object[1] { query }, ExecuteNonQueryOperationCompleted, userState);
	}

	private void OnExecuteNonQueryOperationCompleted(object arg)
	{
		if (this.ExecuteNonQueryCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.ExecuteNonQueryCompleted(this, new ExecuteNonQueryCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	public new void CancelAsync(object userState)
	{
		base.CancelAsync(userState);
	}

	private bool IsLocalFileSystemWebService(string url)
	{
		if (url == null || url == string.Empty)
		{
			return false;
		}
		Uri uri = new Uri(url);
		if (uri.Port >= 1024 && string.Compare(uri.Host, "localHost", StringComparison.OrdinalIgnoreCase) == 0)
		{
			return true;
		}
		return false;
	}
}
