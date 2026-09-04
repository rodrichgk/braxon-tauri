namespace SC_F2_EVO;

public struct AddCiclo
{
	public int CarsServiceID;

	public sbyte OpID;

	public bool Result;

	public AddCiclo(int id, sbyte opid, bool result)
	{
		CarsServiceID = id;
		OpID = opid;
		Result = result;
	}
}
