namespace SC_F2_EVO;

public struct AddError
{
	public int CarsServiceID;

	public sbyte OpID;

	public bool Result;

	public AddError(int id, sbyte opid, bool result)
	{
		CarsServiceID = id;
		OpID = opid;
		Result = result;
	}
}
