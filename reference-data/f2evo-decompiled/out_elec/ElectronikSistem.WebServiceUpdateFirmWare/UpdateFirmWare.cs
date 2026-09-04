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

namespace ElectronikSistem.WebServiceUpdateFirmWare;

[GeneratedCode("System.Web.Services", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
[WebServiceBinding(Name = "UpdateFirmWareSoap", Namespace = "http://tempuri.org/")]
public class UpdateFirmWare : SoapHttpClientProtocol
{
	private SendOrPostCallback ListaOperationCompleted;

	private SendOrPostCallback ImAliveOperationCompleted;

	private SendOrPostCallback UploadFirmWareNewOperationCompleted;

	private SendOrPostCallback UploadFirmWareOperationCompleted;

	private SendOrPostCallback UpdateElectronicBenchOperationCompleted;

	private SendOrPostCallback UpdateSCF2EvoBenchOperationCompleted;

	private SendOrPostCallback UpdateSensorABSOperationCompleted;

	private bool useDefaultCredentialsSetExplicitly;

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

	public event ListaCompletedEventHandler ListaCompleted;

	public event ImAliveCompletedEventHandler ImAliveCompleted;

	public event UploadFirmWareNewCompletedEventHandler UploadFirmWareNewCompleted;

	public event UploadFirmWareCompletedEventHandler UploadFirmWareCompleted;

	public event UpdateElectronicBenchCompletedEventHandler UpdateElectronicBenchCompleted;

	public event UpdateSCF2EvoBenchCompletedEventHandler UpdateSCF2EvoBenchCompleted;

	public event UpdateSensorABSCompletedEventHandler UpdateSensorABSCompleted;

	public UpdateFirmWare()
	{
		Url = Settings.Default.ElectronikSistem_WebServiceUpdateFirmWare_UpdateFirmWare;
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

	[SoapDocumentMethod("http://tempuri.org/Lista", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public string[] Lista()
	{
		object[] array = Invoke("Lista", new object[0]);
		return (string[])array[0];
	}

	public void ListaAsync()
	{
		ListaAsync(null);
	}

	public void ListaAsync(object userState)
	{
		if (ListaOperationCompleted == null)
		{
			ListaOperationCompleted = OnListaOperationCompleted;
		}
		InvokeAsync("Lista", new object[0], ListaOperationCompleted, userState);
	}

	private void OnListaOperationCompleted(object arg)
	{
		if (this.ListaCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.ListaCompleted(this, new ListaCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/ImAlive", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public string ImAlive(string Company)
	{
		object[] array = Invoke("ImAlive", new object[1] { Company });
		return (string)array[0];
	}

	public void ImAliveAsync(string Company)
	{
		ImAliveAsync(Company, null);
	}

	public void ImAliveAsync(string Company, object userState)
	{
		if (ImAliveOperationCompleted == null)
		{
			ImAliveOperationCompleted = OnImAliveOperationCompleted;
		}
		InvokeAsync("ImAlive", new object[1] { Company }, ImAliveOperationCompleted, userState);
	}

	private void OnImAliveOperationCompleted(object arg)
	{
		if (this.ImAliveCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.ImAliveCompleted(this, new ImAliveCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/UploadFirmWareNew", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	[return: XmlElement(DataType = "base64Binary")]
	public byte[] UploadFirmWareNew(string UserName, string SerialNumber, string Firmware, string Code)
	{
		object[] array = Invoke("UploadFirmWareNew", new object[4] { UserName, SerialNumber, Firmware, Code });
		return (byte[])array[0];
	}

	public void UploadFirmWareNewAsync(string UserName, string SerialNumber, string Firmware, string Code)
	{
		UploadFirmWareNewAsync(UserName, SerialNumber, Firmware, Code, null);
	}

	public void UploadFirmWareNewAsync(string UserName, string SerialNumber, string Firmware, string Code, object userState)
	{
		if (UploadFirmWareNewOperationCompleted == null)
		{
			UploadFirmWareNewOperationCompleted = OnUploadFirmWareNewOperationCompleted;
		}
		InvokeAsync("UploadFirmWareNew", new object[4] { UserName, SerialNumber, Firmware, Code }, UploadFirmWareNewOperationCompleted, userState);
	}

	private void OnUploadFirmWareNewOperationCompleted(object arg)
	{
		if (this.UploadFirmWareNewCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.UploadFirmWareNewCompleted(this, new UploadFirmWareNewCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/UploadFirmWare", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	[return: XmlElement(DataType = "base64Binary")]
	public byte[] UploadFirmWare(string UserName, string Firmware, string Code)
	{
		object[] array = Invoke("UploadFirmWare", new object[3] { UserName, Firmware, Code });
		return (byte[])array[0];
	}

	public void UploadFirmWareAsync(string UserName, string Firmware, string Code)
	{
		UploadFirmWareAsync(UserName, Firmware, Code, null);
	}

	public void UploadFirmWareAsync(string UserName, string Firmware, string Code, object userState)
	{
		if (UploadFirmWareOperationCompleted == null)
		{
			UploadFirmWareOperationCompleted = OnUploadFirmWareOperationCompleted;
		}
		InvokeAsync("UploadFirmWare", new object[3] { UserName, Firmware, Code }, UploadFirmWareOperationCompleted, userState);
	}

	private void OnUploadFirmWareOperationCompleted(object arg)
	{
		if (this.UploadFirmWareCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.UploadFirmWareCompleted(this, new UploadFirmWareCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/UpdateElectronicBench", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public bool UpdateElectronicBench(string UserName, string Code)
	{
		object[] array = Invoke("UpdateElectronicBench", new object[2] { UserName, Code });
		return (bool)array[0];
	}

	public void UpdateElectronicBenchAsync(string UserName, string Code)
	{
		UpdateElectronicBenchAsync(UserName, Code, null);
	}

	public void UpdateElectronicBenchAsync(string UserName, string Code, object userState)
	{
		if (UpdateElectronicBenchOperationCompleted == null)
		{
			UpdateElectronicBenchOperationCompleted = OnUpdateElectronicBenchOperationCompleted;
		}
		InvokeAsync("UpdateElectronicBench", new object[2] { UserName, Code }, UpdateElectronicBenchOperationCompleted, userState);
	}

	private void OnUpdateElectronicBenchOperationCompleted(object arg)
	{
		if (this.UpdateElectronicBenchCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.UpdateElectronicBenchCompleted(this, new UpdateElectronicBenchCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/UpdateSCF2EvoBench", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public bool UpdateSCF2EvoBench(string UserName, string SerialNumber, string device, string Code)
	{
		object[] array = Invoke("UpdateSCF2EvoBench", new object[4] { UserName, SerialNumber, device, Code });
		return (bool)array[0];
	}

	public void UpdateSCF2EvoBenchAsync(string UserName, string SerialNumber, string device, string Code)
	{
		UpdateSCF2EvoBenchAsync(UserName, SerialNumber, device, Code, null);
	}

	public void UpdateSCF2EvoBenchAsync(string UserName, string SerialNumber, string device, string Code, object userState)
	{
		if (UpdateSCF2EvoBenchOperationCompleted == null)
		{
			UpdateSCF2EvoBenchOperationCompleted = OnUpdateSCF2EvoBenchOperationCompleted;
		}
		InvokeAsync("UpdateSCF2EvoBench", new object[4] { UserName, SerialNumber, device, Code }, UpdateSCF2EvoBenchOperationCompleted, userState);
	}

	private void OnUpdateSCF2EvoBenchOperationCompleted(object arg)
	{
		if (this.UpdateSCF2EvoBenchCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.UpdateSCF2EvoBenchCompleted(this, new UpdateSCF2EvoBenchCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
		}
	}

	[SoapDocumentMethod("http://tempuri.org/UpdateSensorABS", RequestNamespace = "http://tempuri.org/", ResponseNamespace = "http://tempuri.org/", Use = SoapBindingUse.Literal, ParameterStyle = SoapParameterStyle.Wrapped)]
	public bool UpdateSensorABS(string UserName, string Code)
	{
		object[] array = Invoke("UpdateSensorABS", new object[2] { UserName, Code });
		return (bool)array[0];
	}

	public void UpdateSensorABSAsync(string UserName, string Code)
	{
		UpdateSensorABSAsync(UserName, Code, null);
	}

	public void UpdateSensorABSAsync(string UserName, string Code, object userState)
	{
		if (UpdateSensorABSOperationCompleted == null)
		{
			UpdateSensorABSOperationCompleted = OnUpdateSensorABSOperationCompleted;
		}
		InvokeAsync("UpdateSensorABS", new object[2] { UserName, Code }, UpdateSensorABSOperationCompleted, userState);
	}

	private void OnUpdateSensorABSOperationCompleted(object arg)
	{
		if (this.UpdateSensorABSCompleted != null)
		{
			InvokeCompletedEventArgs e = (InvokeCompletedEventArgs)arg;
			this.UpdateSensorABSCompleted(this, new UpdateSensorABSCompletedEventArgs(e.Results, e.Error, e.Cancelled, e.UserState));
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
