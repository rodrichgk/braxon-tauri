using System;

namespace SC_F2_EVO;

internal struct Report
{
	public DateTime Data;

	public byte Number;

	public string Model;

	public bool State;

	public Report(DateTime Data, byte Number, string Model, bool State)
	{
		this.Data = Data;
		this.Number = Number;
		this.Model = Model;
		this.State = State;
	}
}
