import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    
    // Extract form data
    const data = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      newsletter: formData.get('newsletter'),
      phone: formData.get('phone'),
      whatDoYouNeed: formData.get('whatDoYouNeed'),
      quantity: formData.get('quantity'),
      garmentType: formData.get('garmentType'),
      dateNeeded: formData.get('dateNeeded'),
      notes: formData.get('notes'),
    };
    
    const file = formData.get('file');
    
    // Log the submission (in production, you'd send this via email or save to database)
    console.log('Quote Request Received:', data);
    if (file) {
      console.log('File uploaded:', file.name, file.size, 'bytes');
    }
    
    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, we'll just return success
    // Example with Resend:
    // const { Resend } = require('resend');
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'quotes@threadgiant.com',
    //   to: 'your-email@example.com',
    //   subject: `New Quote Request from ${data.firstName} ${data.lastName}`,
    //   html: `<h1>New Quote Request</h1>...`
    // });
    
    return NextResponse.json(
      { message: 'Quote request submitted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing quote request:', error);
    return NextResponse.json(
      { error: 'Failed to submit quote request' },
      { status: 500 }
    );
  }
}
