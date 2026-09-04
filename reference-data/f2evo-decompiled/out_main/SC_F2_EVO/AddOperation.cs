namespace SC_F2_EVO;

public struct AddOperation
{
	public int CarsServiceID;

	public sbyte OpID;

	public byte Type_Test;

	public AddOperation(int id, sbyte opid, byte type_test)
	{
		CarsServiceID = id;
		OpID = opid;
		Type_Test = type_test;
	}
}
