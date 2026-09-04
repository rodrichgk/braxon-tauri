using stk500;

namespace stk500v1;

public class STK_READ_PAGE : MESSAGE_CMD
{
	public STK_READ_PAGE(int address, byte len)
	{
		base.address = address;
		responselen = (byte)(2 + len);
		CMD = new byte[5]
		{
			Constants_v1.STK_READ_PAGE,
			0,
			len,
			0,
			Constants_v1.CRC_EOP
		};
	}
}
