namespace SC_F2_EVO;

public struct AddTestPressione
{
	public int CarsServiceID;

	public sbyte OpID;

	public bool Result;

	public byte NTest;

	public double Rub1;

	public double Rub2;

	public double Rub3;

	public double Rub4;

	public double Pompa;

	public AddTestPressione(int id, sbyte opid, byte nTest, double rub1, double rub2, double rub3, double rub4, double pompa, bool result)
	{
		CarsServiceID = id;
		OpID = opid;
		NTest = nTest;
		Rub1 = rub1;
		Rub2 = rub2;
		Rub3 = rub3;
		Rub4 = rub4;
		Pompa = pompa;
		Result = result;
	}
}
