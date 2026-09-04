using stk500;

namespace stk500v1;

public class STK_LOAD_ADDRESS : MESSAGE_CMD
{
	public STK_LOAD_ADDRESS(int address)
	{
		responselen = 2;
		base.address = address;
		address >>= 1;
		CMD = new byte[4]
		{
			Constants_v1.STK_LOAD_ADDRESS,
			(byte)(address % 256),
			(byte)(address / 256),
			Constants_v1.CRC_EOP
		};
	}
}
