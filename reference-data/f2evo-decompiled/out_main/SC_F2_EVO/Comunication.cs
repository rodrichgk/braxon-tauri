using ElectronikSistem;

namespace SC_F2_EVO;

internal class Comunication
{
	private delegate void Handle_ResponseReceived(string response, string host);

	public delegate void Handle_Response(bool response, sbyte OpID);

	private HTTP Client;

	private Handle_ResponseReceived DataReceived;

	private string Company;

	private string LINK;

	public event Handle_Response Response;

	public Comunication()
	{
		Client = new HTTP();
		Client.EventHandlerResponse += EventHandlerResponse;
		DataReceived = ResponseReceived;
		FormConfig formConfig = new FormConfig();
		Client.Port = formConfig.Port.Text;
		Client.IP = formConfig.IPServer.Text;
		Client.URL = formConfig.URLServer.Text;
		Company = formConfig.UserName.Text;
		LINK = "http://" + Client.IP + ":" + Client.Port + Client.URL;
		formConfig = null;
	}

	private void EventHandlerResponse(string response, string host)
	{
		DataReceived(response, host);
	}

	private void ResponseReceived(string response, string host)
	{
		bool flag = false;
		sbyte opID = -1;
		flag |= response.IndexOf(">Alive<") > -1;
		if (flag)
		{
			opID = -2;
		}
		flag |= response.IndexOf(">successfull<") > -1;
		int startIndex;
		if ((startIndex = response.IndexOf("ID_Op")) > -1)
		{
			flag = true;
			string text = response.Substring(startIndex).Split(':')[1];
			string s = text.Split('<')[0];
			opID = sbyte.Parse(s);
		}
		if (this.Response != null)
		{
			this.Response(flag, opID);
		}
	}

	public void Alive()
	{
		string text = "/ImAlive?Company=" + Company;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddReportABS(AddReport report)
	{
		string text = "/AddReport?Company=" + Company + "&CarsServiceID=" + report.CarsServiceID + "&ModelID=" + report.ModelID + "&BarCode=" + report.BarCode;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddOperation(AddOperation report)
	{
		string text = "/AddOperation?Company=" + Company + "&CardServiceID=" + report.CarsServiceID + "&OpID=" + report.OpID + "&Test=" + report.Type_Test;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddCiclo(AddCiclo report)
	{
		string text = "/AddCiclo?Company=" + Company + "&CarsServiceID=" + report.CarsServiceID + "&OpID=" + report.OpID + "&Result=" + report.Result;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddTestMotore(AddTestMotore report)
	{
		string text = "/AddTestMotore?Company=" + Company + "&CarsServiceID=" + report.CarsServiceID + "&OpID=" + report.OpID + "&Current=" + report.Current.ToString().Replace(",", ".") + "&Result=" + report.Result;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddError(AddError report)
	{
		string text = "/AddError?Company=" + Company + "&CarsServiceID=" + report.CarsServiceID + "&OpID=" + report.OpID + "&Result=" + report.Result;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}

	public void AddTestPressione(AddTestPressione report)
	{
		string text = "/AddTestPressione?Company=" + Company + "&CarsServiceID=" + report.CarsServiceID + "&OpID=" + report.OpID + "&Test=" + report.NTest + "&R1=" + report.Rub1.ToString().Replace(",", ".") + "&R2=" + report.Rub2.ToString().Replace(",", ".") + "&R3=" + report.Rub3.ToString().Replace(",", ".") + "&R4=" + report.Rub4.ToString().Replace(",", ".") + "&P=" + report.Pompa.ToString().Replace(",", ".") + "&Result=" + report.Result;
		string uRL = LINK + text;
		Client.SendRequest(uRL);
	}
}
