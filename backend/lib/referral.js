const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8) {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

export async function generateUniqueReferralCode(prisma) {
  let code = randomCode();
  let exists = await prisma.user.findUnique({ where: { referralCode: code } });

  while (exists) {
    code = randomCode();
    exists = await prisma.user.findUnique({ where: { referralCode: code } });
  }

  return code;
}