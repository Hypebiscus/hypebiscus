import { Button } from '@/components/ui/button'

const Header = () => {
  return (
    <div className="flex justify-between items-center pt-10 px-[70px]">
      <h1 className='text-2xl font-bold'>Hypebiscus</h1>
        <Button
        variant="default"
      >Connect Wallet</Button>
    </div>
  )
}

export default Header