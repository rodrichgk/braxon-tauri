namespace SC_F2_EVO;

public struct AddTestMotore
{
	public int CarsServiceID;

	public sbyte OpID;

	public double Current;

	public byte Result;

	public AddTestMotore(int id, sbyte opid, double current, byte result)
	{
		CarsServiceID = id;
		OpID = opid;
		Current = current;
		Result = result;
	}
}
