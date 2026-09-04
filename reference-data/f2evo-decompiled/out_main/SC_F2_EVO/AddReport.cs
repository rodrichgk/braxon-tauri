namespace SC_F2_EVO;

public struct AddReport
{
	public int CarsServiceID;

	public byte ModelID;

	public string BarCode;

	public AddReport(int id, byte model, string barcode)
	{
		CarsServiceID = id;
		ModelID = model;
		BarCode = barcode;
	}
}
